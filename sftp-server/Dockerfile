# Stripe Agentic Commerce product-feed delivery destination.
#
# Built on SFTPGo (https://github.com/drakkan/sftpgo) instead of atmoz/sftp.
# SFTPGo gives us exactly what Stripe's SFTP delivery needs and atmoz makes hard:
#   - a fully WRITABLE home root (Stripe creates /[profile_id]/... at the root),
#     with no OpenSSH chroot "root-owned, non-writable" requirement;
#   - native Ed25519 public-key auth with password auth trivially disabled;
#   - idempotent, env-driven user provisioning (loaddata) so Stripe's public key
#     and the app read credential are injected at deploy time, never baked in;
#   - clean use of a persistent volume for delivered files + host keys.
FROM drakkan/sftpgo:v2-alpine-slim

# Root only for image setup + the privileged boot steps in the entrypoint
# (writing the verification token, chowning the Fly volume). The entrypoint
# drops back to the unprivileged sftpgo user (uid 1000) before serving.
USER root

# jq   -> emit strictly-valid loaddata JSON (safe escaping of keys/passwords)
# su-exec -> drop privileges to uid 1000 before exec'ing sftpgo
RUN apk add --no-cache jq su-exec

# The static demo catalog is NOT part of real Stripe delivery. It is kept here
# only for optional "demo mode" (DEMO_MODE=true), seeded into an empty volume so
# the app has something to read before real feeds arrive. Real delivery starts
# from an empty, Stripe-populated, persistent volume and never touches this.
COPY catalog/ /opt/demo-catalog/

COPY entrypoint.sh /usr/local/bin/stripe-entrypoint.sh
RUN chmod +x /usr/local/bin/stripe-entrypoint.sh

# Stripe connects over SFTP on port 22.
EXPOSE 22

ENTRYPOINT ["/usr/local/bin/stripe-entrypoint.sh"]
CMD ["sftpgo", "serve"]
