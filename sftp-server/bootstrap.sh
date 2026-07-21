#!/bin/sh
# Ensure the sftp user owns the preloaded catalog before sshd starts.
chown -R stripefeeds:users /home/stripefeeds/feeds || true
