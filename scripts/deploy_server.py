"""Deploy an immutable Lambda image, verify its public revision, and restore on failure."""
import json
import os
import re
import subprocess
import time
from urllib.request import Request, urlopen

HEALTH_URL = "https://live.plenoai.com/api/health"


def aws(*args):
    return subprocess.run(["aws", "lambda", *args], check=True, text=True,
                          stdout=subprocess.PIPE).stdout.strip()


def update(image):
    aws("update-function-code", "--function-name", os.environ["LAMBDA_FUNCTION"],
        "--image-uri", image, "--query", "LastUpdateStatus", "--output", "text")
    aws("wait", "function-updated-v2", "--function-name", os.environ["LAMBDA_FUNCTION"])


def verify(version=None):
    for attempt in range(10):
        try:
            with urlopen(Request(HEALTH_URL, headers={"Cache-Control": "no-cache"}), timeout=5) as response:
                data = json.load(response)
            if data.get("ok") is True and (version is None or data.get("version") == version):
                return
        except (OSError, ValueError):
            pass
        if attempt < 9:
            time.sleep(1)
    raise RuntimeError("Public health check did not confirm the expected release")


def main():
    version = os.environ["GITHUB_SHA"]
    image = os.environ["IMAGE_URI"]
    if not re.fullmatch(r"[0-9a-f]{40}", version) or not re.fullmatch(
            r"951872725222\.dkr\.ecr\.ap-northeast-1\.amazonaws\.com/pleno-live-api-prod@sha256:[0-9a-f]{64}", image):
        raise ValueError("Expected a full commit SHA and the deployment repository's image digest")
    previous = aws("get-function", "--function-name", os.environ["LAMBDA_FUNCTION"],
                   "--query", "Code.ResolvedImageUri", "--output", "text")
    if "@sha256:" not in previous:
        raise ValueError("The preceding Lambda image must be available for rollback")
    try:
        update(image)
        verify(version)
    except Exception:
        update(previous)
        verify()
        print("Previous Lambda image restored and public health confirmed.", flush=True)
        raise
    print(f"Public endpoint confirmed release {version}.")


if __name__ == "__main__":
    main()
