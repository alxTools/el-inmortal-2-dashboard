#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const LAUNCHER_DIR =
    'C:\\Users\\AlexSerrano\\AppData\\Roaming\\Blackmagic Design\\DaVinci Resolve\\Support\\Fusion\\Scripts\\Utility';
const DROPBOX_ROOT =
    'C:\\Users\\AlexSerrano\\Dropbox\\GALANTE_CONTENT\\El Inmortal 2';

function buildLauncherBody(targetPath, logPath) {
    return `import os\nimport runpy\nimport sys\nimport time\nimport traceback\n\n\nTARGET_SCRIPT = r"${targetPath}"\nLOG_FILE = r"${logPath}"\n\n\ndef write_log(line):\n    stamp = time.strftime("%Y-%m-%d %H:%M:%S")\n    try:\n        with open(LOG_FILE, "a", encoding="utf-8", newline="\\n") as f:\n            f.write(f"[{stamp}] {line}\\n")\n    except Exception:\n        pass\n\n\ndef main():\n    write_log("launcher start")\n    write_log(f"python={sys.version}")\n    write_log(f"executable={sys.executable}")\n    write_log(f"RESOLVE_SCRIPT_API={os.environ.get('RESOLVE_SCRIPT_API', '')}")\n    write_log(f"target={TARGET_SCRIPT}")\n\n    init_globals = {}\n    bmd = globals().get("bmd")\n    resolve = globals().get("resolve")\n    if bmd:\n        init_globals["bmd"] = bmd\n    if resolve:\n        init_globals["resolve"] = resolve\n    if bmd and not resolve and hasattr(bmd, "scriptapp"):\n        try:\n            resolve = bmd.scriptapp("Resolve")\n            if resolve:\n                init_globals["resolve"] = resolve\n        except Exception:\n            pass\n\n    if init_globals:\n        write_log(f"init_globals keys={list(init_globals.keys())}")\n\n    if not os.path.isfile(TARGET_SCRIPT):\n        msg = f"Target script not found: {TARGET_SCRIPT}"\n        write_log(msg)\n        raise RuntimeError(msg)\n\n    try:\n        runpy.run_path(TARGET_SCRIPT, run_name="__main__", init_globals=init_globals)\n        write_log("launcher finished ok")\n    except BaseException:\n        tb = traceback.format_exc()\n        write_log("launcher exception start")\n        for row in tb.splitlines():\n            write_log(row)\n        write_log("launcher exception end")\n        raise\n\n\nif __name__ == "__main__":\n    try:\n        main()\n    except BaseException as exc:\n        write_log(f"launcher failed: {exc}")\n        print(f"ERROR: {exc}")\n        sys.exit(1)\n`;
}

function main() {
    if (!fs.existsSync(LAUNCHER_DIR)) {
        throw new Error(`Launcher directory not found: ${LAUNCHER_DIR}`);
    }

    const entries = fs.readdirSync(LAUNCHER_DIR);
    const updated = [];

    for (const entry of entries) {
        if (!entry.endsWith('.py')) continue;
        if (entry === 'resolve_tools_dashboard.py') continue;
        const launcherPath = path.join(LAUNCHER_DIR, entry);
        const targetPath = path.join(DROPBOX_ROOT, entry);
        const logPath = path.join(DROPBOX_ROOT, `${entry}.last.log`);
        const body = buildLauncherBody(targetPath, logPath);
        fs.writeFileSync(launcherPath, body, 'utf8');
        updated.push(entry);
    }

    console.log(JSON.stringify({ status: 'ok', updatedCount: updated.length }, null, 2));
}

try {
    main();
} catch (error) {
    console.error('update-resolve-launchers error:', error.message);
    process.exitCode = 1;
}
