#!/bin/sh
# Boot-time provisioning for the Stripe Agentic Commerce SFTP delivery target.
#
# Runs as root (see Dockerfile), then drops to the unprivileged sftpgo user.
# Everything here is idempotent: it is safe to run on every deploy/restart, which
# is what makes Stripe's 365-day key rotation a one-liner (update the secret and
# redeploy — the user record is re-imported with the new key).
set -eu

# All persistent state lives on the Fly volume mounted at DATA_ROOT.
DATA_ROOT="${SFTP_DATA_ROOT:-/srv/sftpgo}"
FEED_HOME="${DATA_ROOT}/data"        # shared SFTP root: Stripe writes, app reads
HOST_KEY_DIR="${DATA_ROOT}/host_keys" # stable host keys survive redeploys
LOADDATA_FILE="${DATA_ROOT}/loaddata.json"

STRIPE_USER="${STRIPE_SFTP_USERNAME:-stripe}"
APP_USER="${APP_SFTP_USERNAME:-app}"
SFTPGO_UID_GID="1000:1000"

mkdir -p "$FEED_HOME" "$HOST_KEY_DIR"

# --- 1. Stripe one-time challenge / verification token --------------------------
# Stripe verifies /stripe-verification.txt at the SFTP root before delivering.
# It must stay in place, so we (re)write it from the secret on every boot.
if [ -n "${STRIPE_VERIFICATION_TOKEN:-}" ]; then
  printf '%s' "$STRIPE_VERIFICATION_TOKEN" > "${FEED_HOME}/stripe-verification.txt"
else
  echo "WARN: STRIPE_VERIFICATION_TOKEN is not set; /stripe-verification.txt will not be written." >&2
fi

# --- 2. Build the SFTPGo loaddata document from injected credentials ------------
# Stripe user: Ed25519 public-key auth ONLY (password + keyboard-interactive
# explicitly denied), full write at root because Stripe CREATES the
# /[profile_id]/... directory tree.
if [ -z "${STRIPE_SFTP_PUBLIC_KEY:-}" ]; then
  echo "WARN: STRIPE_SFTP_PUBLIC_KEY is not set; the '${STRIPE_USER}' user has no key yet and cannot log in. Set it as a Fly secret after Stripe onboarding." >&2
fi

stripe_user_json=$(jq -n \
  --arg u "$STRIPE_USER" \
  --arg home "$FEED_HOME" \
  --arg pk "${STRIPE_SFTP_PUBLIC_KEY:-}" \
  '{
     username: $u,
     status: 1,
     home_dir: $home,
     permissions: { "/": ["*"] },
     public_keys: (if $pk == "" then [] else [$pk] end),
     filters: { denied_login_methods: ["password", "keyboard-interactive", "password-over-SSH"] }
   }')

# App read user: read-only (list + download) on the same storage. Authenticates
# with its own public key OR password so the agent app can read while Stripe's
# user keeps password auth disabled.
app_pk="${APP_SFTP_PUBLIC_KEY:-}"
app_pw="${APP_SFTP_PASSWORD:-}"

if [ -n "$app_pk" ] || [ -n "$app_pw" ]; then
  app_user_json=$(jq -n \
    --arg u "$APP_USER" \
    --arg home "$FEED_HOME" \
    --arg pk "$app_pk" \
    --arg pw "$app_pw" \
    '{
       username: $u,
       status: 1,
       home_dir: $home,
       permissions: { "/": ["list", "download"] }
     }
     + (if $pk == "" then {} else { public_keys: [$pk] } end)
     + (if $pw == "" then {} else { password: $pw } end)')
  jq -n --argjson s "$stripe_user_json" --argjson a "$app_user_json" \
    '{ users: [ $s, $a ] }' > "$LOADDATA_FILE"
else
  echo "WARN: neither APP_SFTP_PUBLIC_KEY nor APP_SFTP_PASSWORD is set; the '${APP_USER}' read user will not be created." >&2
  jq -n --argjson s "$stripe_user_json" '{ users: [ $s ] }' > "$LOADDATA_FILE"
fi

# Import on boot: mode 0 = add new users and UPDATE existing ones (key rotation).
export SFTPGO_LOADDATA_FROM="$LOADDATA_FILE"
export SFTPGO_LOADDATA_MODE="${SFTPGO_LOADDATA_MODE:-0}"

# --- 3. Optional demo mode ------------------------------------------------------
# Seed the bundled static catalog into the volume for local/demo use only.
# Uses cp -n so it NEVER clobbers a real Stripe-delivered file or the token.
case "${DEMO_MODE:-}" in
  1 | true | TRUE | yes | on)
    if [ -d /opt/demo-catalog ]; then
      echo "DEMO_MODE enabled: seeding bundled demo catalog into ${FEED_HOME} (non-destructive)." >&2
      cp -rn /opt/demo-catalog/. "$FEED_HOME"/ 2>/dev/null || true
    fi
    ;;
esac

# --- 4. Hand off to SFTPGo as the unprivileged user -----------------------------
# The Fly volume mounts root-owned; give it to uid 1000 so SFTPGo can read/write.
chown -R "$SFTPGO_UID_GID" "$DATA_ROOT" 2>/dev/null || true

exec su-exec "$SFTPGO_UID_GID" "$@"
