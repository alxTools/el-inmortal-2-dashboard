#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${CONFIG_FILE:-$SCRIPT_DIR/cloudflare-subdomain-redirect.env}"
ROOT_ENV_FILE="${ROOT_ENV_FILE:-$SCRIPT_DIR/../.env}"

CF_ZONE_NAME="${CF_ZONE_NAME:-galantealx.com}"
CF_RECORD_NAME="${CF_RECORD_NAME:-code}"
CF_CNAME_TARGET="${CF_CNAME_TARGET:-ei2.galantealx.com}"
CF_REDIRECT_URL="${CF_REDIRECT_URL:-https://ei2.galantealx.com/tools/code-editor}"
CF_REDIRECT_STATUS="${CF_REDIRECT_STATUS:-301}"
CF_PROXY="${CF_PROXY:-true}"
CF_PRESERVE_QUERY_STRING="${CF_PRESERVE_QUERY_STRING:-false}"
RULESET_NAME="${RULESET_NAME:-Managed dynamic redirects}"

AUTH_MODE=""
ZONE_ID=""
RULESET_ID=""
RULE_ID=""
DNS_RECORD_ID=""
DNS_CONTENT=""
DNS_PROXIED=""
RULE_STATUS_CODE=""
RULE_TARGET_URL=""

AUTH_ARGS=()

usage() {
  cat <<'EOF'
Usage:
  scripts/cloudflare-subdomain-redirect.sh apply
      Ensure CNAME + 301 redirect for the configured subdomain.

  scripts/cloudflare-subdomain-redirect.sh status
      Show current DNS + redirect status for the configured subdomain.

  scripts/cloudflare-subdomain-redirect.sh stop
      Remove managed redirect rule and DNS CNAME for the configured subdomain.

Config files:
  - Default config: scripts/cloudflare-subdomain-redirect.env
  - Example config: scripts/cloudflare-subdomain-redirect.env.example
  - Root credentials file: .env (read-only parse, not sourced)

Examples:
  scripts/cloudflare-subdomain-redirect.sh apply
  scripts/cloudflare-subdomain-redirect.sh status
  CONFIG_FILE=scripts/cloudflare-subdomain-redirect.env scripts/cloudflare-subdomain-redirect.sh stop
EOF
}

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

require_command() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || {
    log "Missing required command: $cmd"
    exit 1
  }
}

normalize_bool() {
  local value
  value="${1:-}"
  value="${value,,}"
  case "$value" in
    true|1|yes|y|on)
      printf 'true'
      ;;
    false|0|no|n|off)
      printf 'false'
      ;;
    *)
      return 1
      ;;
  esac
}

read_env_key() {
  local file="$1"
  local key="$2"
  local line

  [ -f "$file" ] || return 1

  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "$key="*)
        printf '%s' "${line#*=}"
        return 0
        ;;
    esac
  done < "$file"

  return 1
}

load_config_file() {
  if [ -f "$CONFIG_FILE" ]; then
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
  fi
}

resolve_auth() {
  local from_env

  CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
  GLOBAL_API_KEY="${GLOBAL_API_KEY:-}"
  CF_EMAIL="${CF_EMAIL:-${CLOUDFLARE_EMAIL:-${X_AUTH_EMAIL:-}}}"

  if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    from_env="$(read_env_key "$ROOT_ENV_FILE" CLOUDFLARE_API_TOKEN || true)"
    CLOUDFLARE_API_TOKEN="${from_env:-}"
  fi

  if [ -z "$GLOBAL_API_KEY" ]; then
    from_env="$(read_env_key "$ROOT_ENV_FILE" GLOBAL_API_KEY || true)"
    GLOBAL_API_KEY="${from_env:-}"
  fi

  if [ -z "$CF_EMAIL" ]; then
    from_env="$(read_env_key "$ROOT_ENV_FILE" CF_EMAIL || true)"
    CF_EMAIL="${from_env:-}"
  fi

  if [ -z "$CF_EMAIL" ]; then
    from_env="$(read_env_key "$ROOT_ENV_FILE" CLOUDFLARE_EMAIL || true)"
    CF_EMAIL="${from_env:-}"
  fi

  if [ -z "$CF_EMAIL" ]; then
    from_env="$(read_env_key "$ROOT_ENV_FILE" X_AUTH_EMAIL || true)"
    CF_EMAIL="${from_env:-}"
  fi

  if [ -z "$CF_EMAIL" ]; then
    from_env="$(read_env_key "$ROOT_ENV_FILE" SMTP_USER || true)"
    CF_EMAIL="${from_env:-}"
  fi

  if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
    AUTH_MODE="token"
    AUTH_ARGS=(
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
      -H "Content-Type: application/json"
    )
    return 0
  fi

  if [ -n "$GLOBAL_API_KEY" ] && [ -n "$CF_EMAIL" ]; then
    AUTH_MODE="global_key"
    AUTH_ARGS=(
      -H "X-Auth-Key: $GLOBAL_API_KEY"
      -H "X-Auth-Email: $CF_EMAIL"
      -H "Content-Type: application/json"
    )
    return 0
  fi

  log "Missing Cloudflare credentials. Provide CLOUDFLARE_API_TOKEN or GLOBAL_API_KEY + CF_EMAIL."
  exit 1
}

cf_api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local url="https://api.cloudflare.com/client/v4${path}"
  local response

  if [ -n "$body" ]; then
    response="$(curl -sS -X "$method" "$url" "${AUTH_ARGS[@]}" --data "$body")"
  else
    response="$(curl -sS -X "$method" "$url" "${AUTH_ARGS[@]}")"
  fi

  if ! printf '%s' "$response" | perl -MJSON::PP -e 'my $raw=join("",<STDIN>); my $j=eval{decode_json($raw)}; exit 2 if !$j; exit(($j->{success} ? 0 : 1));' >/dev/null 2>&1; then
    log "Cloudflare API error on ${method} ${path}"
    printf '%s' "$response" | perl -MJSON::PP -e '
      my $raw = join("", <STDIN>);
      my $j = eval { decode_json($raw) };
      if (!$j) {
        print "- Failed to parse API response\n";
        exit 0;
      }
      my $errors = $j->{errors};
      if (ref $errors eq "ARRAY" && @{$errors}) {
        for my $err (@{$errors}) {
          my $code = defined $err->{code} ? $err->{code} : "unknown";
          my $msg = defined $err->{message} ? $err->{message} : "unknown";
          print "- [$code] $msg\n";
        }
      } else {
        print "- Unknown Cloudflare API error\n";
      }
    '
    return 1
  fi

  printf '%s' "$response"
}

build_dns_payload() {
  local name="$CF_RECORD_FQDN"
  local content="$CF_CNAME_TARGET"
  local proxied="$CF_PROXY"

  CF_JSON_NAME="$name" CF_JSON_CONTENT="$content" CF_JSON_PROXIED="$proxied" perl -MJSON::PP -e '
    my $proxied = lc($ENV{CF_JSON_PROXIED} // "true");
    my $bool = ($proxied eq "1" || $proxied eq "true") ? JSON::PP::true : JSON::PP::false;
    print encode_json({
      type => "CNAME",
      name => $ENV{CF_JSON_NAME},
      content => $ENV{CF_JSON_CONTENT},
      proxied => $bool,
      ttl => 1
    });
  '
}

build_rule_payload() {
  local description="$RULE_DESCRIPTION"
  local expression="$RULE_EXPRESSION"
  local target_url="$CF_REDIRECT_URL"
  local status_code="$CF_REDIRECT_STATUS"
  local preserve_qs="$CF_PRESERVE_QUERY_STRING"

  CF_JSON_DESCRIPTION="$description" CF_JSON_EXPRESSION="$expression" CF_JSON_TARGET_URL="$target_url" CF_JSON_STATUS_CODE="$status_code" CF_JSON_PRESERVE_QS="$preserve_qs" perl -MJSON::PP -e '
    my $preserve = lc($ENV{CF_JSON_PRESERVE_QS} // "false");
    my $preserve_bool = ($preserve eq "1" || $preserve eq "true") ? JSON::PP::true : JSON::PP::false;
    print encode_json({
      action => "redirect",
      description => $ENV{CF_JSON_DESCRIPTION},
      enabled => JSON::PP::true,
      expression => $ENV{CF_JSON_EXPRESSION},
      action_parameters => {
        from_value => {
          status_code => int($ENV{CF_JSON_STATUS_CODE}),
          target_url => { value => $ENV{CF_JSON_TARGET_URL} },
          preserve_query_string => $preserve_bool
        }
      }
    });
  '
}

build_ruleset_create_payload() {
  local ruleset_name="$RULESET_NAME"
  local description="$RULE_DESCRIPTION"
  local expression="$RULE_EXPRESSION"
  local target_url="$CF_REDIRECT_URL"
  local status_code="$CF_REDIRECT_STATUS"
  local preserve_qs="$CF_PRESERVE_QUERY_STRING"

  CF_JSON_RULESET_NAME="$ruleset_name" CF_JSON_DESCRIPTION="$description" CF_JSON_EXPRESSION="$expression" CF_JSON_TARGET_URL="$target_url" CF_JSON_STATUS_CODE="$status_code" CF_JSON_PRESERVE_QS="$preserve_qs" perl -MJSON::PP -e '
    my $preserve = lc($ENV{CF_JSON_PRESERVE_QS} // "false");
    my $preserve_bool = ($preserve eq "1" || $preserve eq "true") ? JSON::PP::true : JSON::PP::false;
    my $rule = {
      action => "redirect",
      description => $ENV{CF_JSON_DESCRIPTION},
      enabled => JSON::PP::true,
      expression => $ENV{CF_JSON_EXPRESSION},
      action_parameters => {
        from_value => {
          status_code => int($ENV{CF_JSON_STATUS_CODE}),
          target_url => { value => $ENV{CF_JSON_TARGET_URL} },
          preserve_query_string => $preserve_bool
        }
      }
    };

    print encode_json({
      name => $ENV{CF_JSON_RULESET_NAME},
      kind => "zone",
      phase => "http_request_dynamic_redirect",
      rules => [$rule]
    });
  '
}

validate_config() {
  case "$CF_REDIRECT_STATUS" in
    301|302|307|308)
      ;;
    *)
      log "Unsupported redirect status: $CF_REDIRECT_STATUS"
      exit 1
      ;;
  esac

  if ! CF_PROXY="$(normalize_bool "$CF_PROXY")"; then
    log "Invalid CF_PROXY value: $CF_PROXY"
    exit 1
  fi

  if ! CF_PRESERVE_QUERY_STRING="$(normalize_bool "$CF_PRESERVE_QUERY_STRING")"; then
    log "Invalid CF_PRESERVE_QUERY_STRING value: $CF_PRESERVE_QUERY_STRING"
    exit 1
  fi

  if [[ "$CF_RECORD_NAME" == *.* ]]; then
    CF_RECORD_FQDN="$CF_RECORD_NAME"
  else
    CF_RECORD_FQDN="$CF_RECORD_NAME.$CF_ZONE_NAME"
  fi

  RULE_EXPRESSION="(http.host eq \"$CF_RECORD_FQDN\")"
  RULE_DESCRIPTION="${RULE_DESCRIPTION:-Managed by scripts/cloudflare-subdomain-redirect.sh: $CF_RECORD_FQDN -> $CF_REDIRECT_URL}"
}

lookup_zone_id() {
  local zone_response
  zone_response="$(cf_api GET "/zones?name=$CF_ZONE_NAME&status=active")"

  ZONE_ID="$(printf '%s' "$zone_response" | perl -MJSON::PP -e '
    my $j = decode_json(join("", <STDIN>));
    my $result = $j->{result};
    if (ref $result eq "ARRAY" && @{$result}) {
      print $result->[0]{id} // "";
    }
  ')"

  if [ -z "$ZONE_ID" ]; then
    log "Zone not found or inaccessible: $CF_ZONE_NAME"
    exit 1
  fi
}

load_dns_state() {
  local dns_response
  dns_response="$(cf_api GET "/zones/$ZONE_ID/dns_records?type=CNAME&name=$CF_RECORD_FQDN")"

  DNS_RECORD_ID="$(printf '%s' "$dns_response" | perl -MJSON::PP -e '
    my $j = decode_json(join("", <STDIN>));
    my $r = $j->{result};
    if (ref $r eq "ARRAY" && @{$r}) {
      print $r->[0]{id} // "";
    }
  ')"

  DNS_CONTENT="$(printf '%s' "$dns_response" | perl -MJSON::PP -e '
    my $j = decode_json(join("", <STDIN>));
    my $r = $j->{result};
    if (ref $r eq "ARRAY" && @{$r}) {
      print $r->[0]{content} // "";
    }
  ')"

  DNS_PROXIED="$(printf '%s' "$dns_response" | perl -MJSON::PP -e '
    my $j = decode_json(join("", <STDIN>));
    my $r = $j->{result};
    if (ref $r eq "ARRAY" && @{$r}) {
      my $p = $r->[0]{proxied};
      if (defined $p) {
        print $p ? "true" : "false";
      }
    }
  ')"
}

ensure_dns_record() {
  local dns_payload
  load_dns_state
  dns_payload="$(build_dns_payload)"

  if [ -n "$DNS_RECORD_ID" ]; then
    cf_api PUT "/zones/$ZONE_ID/dns_records/$DNS_RECORD_ID" "$dns_payload" >/dev/null
    log "Updated DNS CNAME: $CF_RECORD_FQDN -> $CF_CNAME_TARGET"
  else
    cf_api POST "/zones/$ZONE_ID/dns_records" "$dns_payload" >/dev/null
    log "Created DNS CNAME: $CF_RECORD_FQDN -> $CF_CNAME_TARGET"
  fi
}

load_ruleset_state() {
  local rulesets_response
  rulesets_response="$(cf_api GET "/zones/$ZONE_ID/rulesets")"

  RULESET_ID="$(printf '%s' "$rulesets_response" | perl -MJSON::PP -e '
    my $j = decode_json(join("", <STDIN>));
    my $result = $j->{result};
    my $id = "";
    if (ref $result eq "ARRAY") {
      for my $rs (@{$result}) {
        next unless ($rs->{kind} // "") eq "zone";
        next unless ($rs->{phase} // "") eq "http_request_dynamic_redirect";
        $id = $rs->{id} // "";
        last if $id ne "";
      }
    }
    print $id;
  ')"
}

load_rule_state() {
  RULE_ID=""
  RULE_STATUS_CODE=""
  RULE_TARGET_URL=""

  [ -n "$RULESET_ID" ] || return 0

  local ruleset_response
  ruleset_response="$(cf_api GET "/zones/$ZONE_ID/rulesets/$RULESET_ID")"

  RULE_ID="$(printf '%s' "$ruleset_response" | RULE_DESCRIPTION="$RULE_DESCRIPTION" RULE_EXPRESSION="$RULE_EXPRESSION" perl -MJSON::PP -e '
    my $j = decode_json(join("", <STDIN>));
    my $rules = $j->{result}{rules};
    my $id = "";
    if (ref $rules eq "ARRAY") {
      for my $rule (@{$rules}) {
        next unless ($rule->{action} // "") eq "redirect";
        my $desc = $rule->{description} // "";
        my $expr = $rule->{expression} // "";
        if ($desc eq $ENV{RULE_DESCRIPTION} || $expr eq $ENV{RULE_EXPRESSION}) {
          $id = $rule->{id} // "";
          last if $id ne "";
        }
      }
    }
    print $id;
  ')"

  RULE_STATUS_CODE="$(printf '%s' "$ruleset_response" | RULE_DESCRIPTION="$RULE_DESCRIPTION" RULE_EXPRESSION="$RULE_EXPRESSION" perl -MJSON::PP -e '
    my $j = decode_json(join("", <STDIN>));
    my $rules = $j->{result}{rules};
    my $status = "";
    if (ref $rules eq "ARRAY") {
      for my $rule (@{$rules}) {
        next unless ($rule->{action} // "") eq "redirect";
        my $desc = $rule->{description} // "";
        my $expr = $rule->{expression} // "";
        if ($desc eq $ENV{RULE_DESCRIPTION} || $expr eq $ENV{RULE_EXPRESSION}) {
          my $code = $rule->{action_parameters}{from_value}{status_code};
          $status = defined $code ? $code : "";
          last;
        }
      }
    }
    print $status;
  ')"

  RULE_TARGET_URL="$(printf '%s' "$ruleset_response" | RULE_DESCRIPTION="$RULE_DESCRIPTION" RULE_EXPRESSION="$RULE_EXPRESSION" perl -MJSON::PP -e '
    my $j = decode_json(join("", <STDIN>));
    my $rules = $j->{result}{rules};
    my $url = "";
    if (ref $rules eq "ARRAY") {
      for my $rule (@{$rules}) {
        next unless ($rule->{action} // "") eq "redirect";
        my $desc = $rule->{description} // "";
        my $expr = $rule->{expression} // "";
        if ($desc eq $ENV{RULE_DESCRIPTION} || $expr eq $ENV{RULE_EXPRESSION}) {
          $url = $rule->{action_parameters}{from_value}{target_url}{value} // "";
          last;
        }
      }
    }
    print $url;
  ')"
}

ensure_redirect_rule() {
  local rule_payload

  load_ruleset_state

  if [ -z "$RULESET_ID" ]; then
    local create_ruleset_payload
    create_ruleset_payload="$(build_ruleset_create_payload)"
    cf_api POST "/zones/$ZONE_ID/rulesets" "$create_ruleset_payload" >/dev/null
    log "Created dynamic redirect ruleset and managed redirect rule."
    return 0
  fi

  load_rule_state
  rule_payload="$(build_rule_payload)"

  if [ -n "$RULE_ID" ]; then
    cf_api PATCH "/zones/$ZONE_ID/rulesets/$RULESET_ID/rules/$RULE_ID" "$rule_payload" >/dev/null
    log "Updated redirect rule for host: $CF_RECORD_FQDN"
  else
    cf_api POST "/zones/$ZONE_ID/rulesets/$RULESET_ID/rules" "$rule_payload" >/dev/null
    log "Created redirect rule for host: $CF_RECORD_FQDN"
  fi
}

remove_redirect_rule() {
  load_ruleset_state
  [ -n "$RULESET_ID" ] || return 0

  load_rule_state
  if [ -n "$RULE_ID" ]; then
    cf_api DELETE "/zones/$ZONE_ID/rulesets/$RULESET_ID/rules/$RULE_ID" >/dev/null
    log "Removed managed redirect rule for host: $CF_RECORD_FQDN"
  else
    log "Managed redirect rule not present; nothing to remove."
  fi
}

remove_dns_record() {
  load_dns_state

  if [ -n "$DNS_RECORD_ID" ]; then
    cf_api DELETE "/zones/$ZONE_ID/dns_records/$DNS_RECORD_ID" >/dev/null
    log "Removed DNS CNAME: $CF_RECORD_FQDN"
  else
    log "DNS CNAME not present; nothing to remove."
  fi
}

status_report() {
  load_dns_state
  load_ruleset_state
  load_rule_state

  printf 'ZONE_NAME=%s\n' "$CF_ZONE_NAME"
  printf 'ZONE_ID=%s\n' "$ZONE_ID"
  printf 'AUTH_MODE=%s\n' "$AUTH_MODE"
  printf 'RECORD_FQDN=%s\n' "$CF_RECORD_FQDN"
  if [ -n "$DNS_RECORD_ID" ]; then
    printf 'DNS_STATUS=present\n'
    printf 'DNS_ID=%s\n' "$DNS_RECORD_ID"
    printf 'DNS_CONTENT=%s\n' "$DNS_CONTENT"
    printf 'DNS_PROXIED=%s\n' "$DNS_PROXIED"
  else
    printf 'DNS_STATUS=missing\n'
  fi

  if [ -n "$RULESET_ID" ]; then
    printf 'RULESET_STATUS=present\n'
    printf 'RULESET_ID=%s\n' "$RULESET_ID"
  else
    printf 'RULESET_STATUS=missing\n'
  fi

  if [ -n "$RULE_ID" ]; then
    printf 'REDIRECT_RULE_STATUS=present\n'
    printf 'REDIRECT_RULE_ID=%s\n' "$RULE_ID"
    printf 'REDIRECT_TARGET_URL=%s\n' "$RULE_TARGET_URL"
    printf 'REDIRECT_STATUS_CODE=%s\n' "$RULE_STATUS_CODE"
  else
    printf 'REDIRECT_RULE_STATUS=missing\n'
  fi
}

apply_flow() {
  lookup_zone_id
  ensure_dns_record
  ensure_redirect_rule
  log "Apply complete."
}

stop_flow() {
  lookup_zone_id
  remove_redirect_rule
  remove_dns_record
  log "Stop complete."
}

status_flow() {
  lookup_zone_id
  status_report
}

main() {
  require_command curl
  require_command perl
  load_config_file
  validate_config
  resolve_auth

  case "${1:-}" in
    apply)
      apply_flow
      ;;
    status)
      status_flow
      ;;
    stop)
      stop_flow
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
