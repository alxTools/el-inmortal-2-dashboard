#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${CONFIG_FILE:-$SCRIPT_DIR/start-streams.env}"

if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

HOST1="${HOST1:-root@live.galantealx.com}"
HOST2="${HOST2:-root@live2.galantealx.com}"

SCRIPT1="${SCRIPT1:-/root/start-server.sh}"
SCRIPT2="${SCRIPT2:-/root/start-server2.sh}"

SESSION1="${SESSION1:-yt_live_1}"
SESSION2="${SESSION2:-yt_live_2}"

SSH_OPTS=(-o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
# Si usas llave especifica:
# SSH_OPTS+=(-i "$HOME/.ssh/tu_llave")
if [ -n "${SSH_KEY:-}" ]; then
  SSH_OPTS+=(-i "$SSH_KEY")
fi

usage() {
  cat <<'EOF'
Uso:
  ./start-streams.sh now
      Inicia ambos streams ahora (en paralelo).

  ./start-streams.sh delay <segundos>
      Inicia server1 ahora y server2 despues de <segundos>.

  ./start-streams.sh at "<fecha-hora>"
      Programa ambos para la misma fecha/hora.

  ./start-streams.sh at "<fecha-hora-server1>" "<fecha-hora-server2>"
      Programa cada servidor con hora distinta.

  ./start-streams.sh status [all|1|2]
      Muestra estado de tmux y de inicio programado.

  ./start-streams.sh stop [all|1|2]
      Detiene tmux y cancela inicio programado.

Configuracion reutilizable:
  - Archivo por defecto: scripts/start-streams.env
  - Puedes cambiarlo con: CONFIG_FILE=/ruta/mi-config.env ./start-streams.sh status
  - Puedes copiar desde: scripts/start-streams.env.example

Ejemplos:
  ./start-streams.sh now
  ./start-streams.sh delay 180
  ./start-streams.sh at "today 20:00"
  ./start-streams.sh at "today 20:00" "today 20:07"
  ./start-streams.sh status
  ./start-streams.sh stop 2
EOF
}

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

remote_start_now() {
  local host="$1"
  local script="$2"
  local session="$3"

  ssh "${SSH_OPTS[@]}" "$host" "bash -s" -- "$script" "$session" <<'EOF'
set -euo pipefail
script="$1"
session="$2"
pidfile="/tmp/${session}_auto_start.pid"

command -v tmux >/dev/null 2>&1 || { echo "ERROR: tmux no instalado en $(hostname)"; exit 1; }

if [ -f "$pidfile" ]; then
  sched_pid=$(cat "$pidfile" 2>/dev/null || true)
  if [ -n "${sched_pid:-}" ] && kill -0 "$sched_pid" 2>/dev/null; then
    kill "$sched_pid" 2>/dev/null || true
  fi
  rm -f "$pidfile"
fi

if tmux has-session -t "$session" 2>/dev/null; then
  tmux kill-session -t "$session"
fi

tmux new-session -d -s "$session" "bash -lc 'cd /root && chmod +x \"$script\" && \"$script\"'"
echo "OK $(hostname): sesion '$session' iniciada"
EOF
}

remote_schedule_at() {
  local host="$1"
  local script="$2"
  local session="$3"
  local target_epoch="$4"

  ssh "${SSH_OPTS[@]}" "$host" "bash -s" -- "$script" "$session" "$target_epoch" <<'EOF'
set -euo pipefail
script="$1"
session="$2"
target_epoch="$3"
pidfile="/tmp/${session}_auto_start.pid"
logfile="/tmp/${session}_auto_start.log"

command -v tmux >/dev/null 2>&1 || { echo "ERROR: tmux no instalado en $(hostname)"; exit 1; }

if ! [[ "$target_epoch" =~ ^[0-9]+$ ]]; then
  echo "ERROR: epoch invalido en $(hostname): $target_epoch"
  exit 1
fi
now_epoch=$(date +%s)
delay=$((target_epoch - now_epoch))
if [ "$delay" -lt 0 ]; then
  delay=0
fi

if [ -f "$pidfile" ]; then
  old_pid=$(cat "$pidfile" 2>/dev/null || true)
  if [ -n "${old_pid:-}" ] && kill -0 "$old_pid" 2>/dev/null; then
    kill "$old_pid" 2>/dev/null || true
  fi
  rm -f "$pidfile"
fi

nohup bash -s -- "$delay" "$session" "$script" "$pidfile" >"$logfile" 2>&1 <<'INNER' &
set -euo pipefail
delay="$1"
session="$2"
script="$3"
pidfile="$4"

sleep "$delay"
if tmux has-session -t "$session" 2>/dev/null; then
  tmux kill-session -t "$session"
fi
tmux new-session -d -s "$session" "bash -lc 'cd /root && chmod +x \"$script\" && \"$script\"'"
rm -f "$pidfile"
INNER

sched_pid=$!
echo "$sched_pid" > "$pidfile"
echo "OK $(hostname): sesion '$session' programada en ${delay}s (pid $sched_pid)"
EOF
}

remote_status() {
  local host="$1"
  local session="$2"

  ssh "${SSH_OPTS[@]}" "$host" "bash -s" -- "$session" <<'EOF'
set -euo pipefail
session="$1"
pidfile="/tmp/${session}_auto_start.pid"

command -v tmux >/dev/null 2>&1 || { echo "ERROR: tmux no instalado en $(hostname)"; exit 1; }

running="no"
pending="no"
pid=""

if tmux has-session -t "$session" 2>/dev/null; then
  running="yes"
fi

if [ -f "$pidfile" ]; then
  pid=$(cat "$pidfile" 2>/dev/null || true)
  if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
    pending="yes"
  else
    rm -f "$pidfile"
    pid=""
  fi
fi

if [ -n "$pid" ]; then
  echo "OK $(hostname): session=$session running=$running pending_start=$pending pid=$pid"
else
  echo "OK $(hostname): session=$session running=$running pending_start=$pending"
fi
EOF
}

remote_stop() {
  local host="$1"
  local session="$2"

  ssh "${SSH_OPTS[@]}" "$host" "bash -s" -- "$session" <<'EOF'
set -euo pipefail
session="$1"
pidfile="/tmp/${session}_auto_start.pid"

command -v tmux >/dev/null 2>&1 || { echo "ERROR: tmux no instalado en $(hostname)"; exit 1; }

stopped="no"
cancelled_pending="no"

if tmux has-session -t "$session" 2>/dev/null; then
  tmux kill-session -t "$session"
  stopped="yes"
fi

if [ -f "$pidfile" ]; then
  pid=$(cat "$pidfile" 2>/dev/null || true)
  if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    cancelled_pending="yes"
  fi
  rm -f "$pidfile"
fi

echo "OK $(hostname): session=$session stopped=$stopped cancelled_pending=$cancelled_pending"
EOF
}

run_target_status() {
  local target="$1"
  case "$target" in
    all)
      remote_status "$HOST1" "$SESSION1" &
      p1=$!
      remote_status "$HOST2" "$SESSION2" &
      p2=$!
      wait "$p1" "$p2"
      ;;
    1)
      remote_status "$HOST1" "$SESSION1"
      ;;
    2)
      remote_status "$HOST2" "$SESSION2"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

run_target_stop() {
  local target="$1"
  case "$target" in
    all)
      remote_stop "$HOST1" "$SESSION1" &
      p1=$!
      remote_stop "$HOST2" "$SESSION2" &
      p2=$!
      wait "$p1" "$p2"
      ;;
    1)
      remote_stop "$HOST1" "$SESSION1"
      ;;
    2)
      remote_stop "$HOST2" "$SESSION2"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

case "${1:-}" in
  now)
    log "Iniciando ambos streams ahora..."
    remote_start_now "$HOST1" "$SCRIPT1" "$SESSION1" &
    p1=$!
    remote_start_now "$HOST2" "$SCRIPT2" "$SESSION2" &
    p2=$!
    wait "$p1" "$p2"
    log "Listo."
    ;;

  delay)
    delay_sec="${2:-}"
    [[ "$delay_sec" =~ ^[0-9]+$ ]] || { usage; exit 1; }
    log "Iniciando stream en $HOST1..."
    remote_start_now "$HOST1" "$SCRIPT1" "$SESSION1"
    log "Esperando $delay_sec segundos..."
    sleep "$delay_sec"
    log "Iniciando stream en $HOST2..."
    remote_start_now "$HOST2" "$SCRIPT2" "$SESSION2"
    log "Listo."
    ;;

  at)
    t1="${2:-}"
    t2="${3:-${2:-}}"
    [[ -n "$t1" ]] || { usage; exit 1; }
    epoch1=$(date -d "$t1" +%s 2>/dev/null) || {
      log "Fecha/hora invalida para server1: $t1"
      exit 1
    }
    epoch2=$(date -d "$t2" +%s 2>/dev/null) || {
      log "Fecha/hora invalida para server2: $t2"
      exit 1
    }
    log "Programando stream 1 para: $t1"
    log "Programando stream 2 para: $t2"
    remote_schedule_at "$HOST1" "$SCRIPT1" "$SESSION1" "$epoch1" &
    p1=$!
    remote_schedule_at "$HOST2" "$SCRIPT2" "$SESSION2" "$epoch2" &
    p2=$!
    wait "$p1" "$p2"
    log "Listo: ambos quedaron programados."
    ;;

  status)
    target="${2:-all}"
    run_target_status "$target"
    ;;

  stop)
    target="${2:-all}"
    run_target_stop "$target"
    ;;

  *)
    usage
    exit 1
    ;;
esac
