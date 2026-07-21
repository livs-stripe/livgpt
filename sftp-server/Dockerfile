FROM atmoz/sftp:alpine

# Static demo catalog: one dir per merchant, each with manifest.json carrying
# the real Stripe profile id + a products.csv shard. Baked into the image so no
# persistent volume is needed for this read-only demo.
COPY catalog/ /home/stripefeeds/feeds/

# atmoz runs scripts in /etc/sftp.d/ on boot (before sshd). Use it to fix perms.
COPY bootstrap.sh /etc/sftp.d/00-bootstrap.sh
RUN chmod +x /etc/sftp.d/00-bootstrap.sh

EXPOSE 22
# user:password:uid:gid:dir  -> serves /home/stripefeeds/feeds
CMD ["stripefeeds:REPLACE_WITH_STRONG_PASSWORD:::feeds"]
