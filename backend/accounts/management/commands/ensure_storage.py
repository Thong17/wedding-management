"""Prepare the S3 / MinIO bucket: create it if missing and make only avatars/ and invites/ publicly readable.

Runs at container start (docker-entrypoint.sh). Does nothing with local file storage. If the access key
isn't allowed to create buckets or set policies, it explains what to set up by hand instead of failing.
"""

import json

from django.conf import settings
from django.core.management.base import BaseCommand


def public_read_policy(bucket: str) -> str:
    # Anonymous read of profile pictures and published-invitation pictures only. Everything else
    # (private/ = client documents) stays private.
    return json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"AWS": ["*"]},
            "Action": ["s3:GetObject"],
            "Resource": [f"arn:aws:s3:::{bucket}/avatars/*", f"arn:aws:s3:::{bucket}/invites/*"],
        }],
    })


class Command(BaseCommand):
    help = "Create the upload bucket and its public-read policy for avatars/ and invites/ (S3 storage only)."

    def handle(self, *args, **options):
        if settings.STORAGE_BACKEND != "s3":
            return
        import boto3
        from botocore.exceptions import ClientError

        opts = settings.STORAGES["default"]["OPTIONS"]
        bucket = opts["bucket_name"]
        s3 = boto3.client(
            "s3",
            endpoint_url=opts["endpoint_url"],
            aws_access_key_id=opts["access_key"],
            aws_secret_access_key=opts["secret_key"],
            region_name=opts["region_name"],
        )
        try:
            try:
                s3.head_bucket(Bucket=bucket)
            except ClientError as exc:
                if exc.response.get("Error", {}).get("Code") not in ("404", "NoSuchBucket", "NotFound"):
                    raise
                s3.create_bucket(Bucket=bucket)
                self.stdout.write(f"Created bucket {bucket}.")
            s3.put_bucket_policy(Bucket=bucket, Policy=public_read_policy(bucket))
            self.stdout.write(f"Storage ready: bucket {bucket}, public read on avatars/ and invites/ only.")
        except ClientError as exc:
            self.stderr.write(
                f"Could not prepare bucket {bucket!r} ({exc.response.get('Error', {}).get('Code')}). "
                f"In the MinIO console, create the bucket and add an anonymous read-only access rule for "
                f"the prefixes 'avatars/' and 'invites/' (nothing else). The app keeps running."
            )
        except Exception as exc:  # e.g. MinIO not reachable yet: never stop the API from starting
            self.stderr.write(f"Could not reach storage at {opts['endpoint_url']} ({exc}). Uploads fail until it is reachable.")
