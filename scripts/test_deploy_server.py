import io
import json
import os
import subprocess
import unittest
from unittest.mock import patch

import deploy_server as deploy


class DeploymentTests(unittest.TestCase):
    def exercise(self, revision, update_failure=False):
        image = "951872725222.dkr.ecr.ap-northeast-1.amazonaws.com/pleno-live-api-prod@sha256:"
        previous, target = image + "a" * 64, image + "b" * 64
        calls = []

        def aws(*args):
            calls.append(args)
            if args[0] == "get-function":
                return previous
            if update_failure and target in args:
                raise subprocess.CalledProcessError(1, ["aws", "lambda", "update-function-code"])
            return ""

        def response(*args, **kwargs):
            return io.BytesIO(json.dumps({"ok": True, "version": revision}).encode())

        with patch.dict(os.environ, GITHUB_SHA="c" * 40, IMAGE_URI=target, LAMBDA_FUNCTION="pleno-live-api-prod"), \
                patch.object(deploy, "aws", side_effect=aws), \
                patch.object(deploy, "urlopen", side_effect=response), \
                patch.object(deploy.time, "sleep"):
            if update_failure:
                with self.assertRaises(subprocess.CalledProcessError):
                    deploy.main()
            elif revision != "c" * 40:
                with self.assertRaises(RuntimeError):
                    deploy.main()
            else:
                deploy.main()
        return [c[c.index("--image-uri") + 1] for c in calls if c[0] == "update-function-code"], previous, target

    def test_exact_revision_succeeds_without_rollback(self):
        images, previous, target = self.exercise("c" * 40)
        self.assertEqual(images, [target])

    def test_http_200_from_an_old_revision_restores_previous_image_and_fails(self):
        images, previous, target = self.exercise("old-release")
        self.assertEqual(images, [target, previous])

    def test_partial_update_failure_restores_previous_image_and_fails(self):
        images, previous, target = self.exercise("old-release", update_failure=True)
        self.assertEqual(images, [target, previous])

    def test_mutable_image_tag_is_rejected_before_any_aws_change(self):
        with patch.dict(os.environ, GITHUB_SHA="c" * 40, IMAGE_URI="repository:latest"), \
                patch.object(deploy, "aws") as aws:
            with self.assertRaises(ValueError):
                deploy.main()
            aws.assert_not_called()


if __name__ == "__main__":
    unittest.main()
