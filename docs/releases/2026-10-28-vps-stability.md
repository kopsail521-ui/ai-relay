# Existing VPS stability controls, 2026-10-28

The user declined paid memory expansion and authorized the remaining stability work. These controls target the existing 2 CPU / 894.6MiB host. The 10/27 cloud diagnosis established disk I/O restriction; the exact initiating process remains unknown. CPU 60% is not an automatic reboot condition.

## Application changes

- Both gateways budget **32MiB total retained request bodies per process**, including reference media held by async image jobs. Admission rejects concurrent overload/low memory with HTTP 503 and Retry-After before generation/billing. A single buffered request over 32MiB receives HTTP 413; this lowers the effective buffered upload maximum from the previous 100MiB file / 128MiB proxy limits. Users must reduce files or supply existing media URLs. This is a deliberate capacity tradeoff for the fixed 1GB host.
- The front proxy admits up to 8 body-bearing requests, native media up to 4. Reads have a 30-second idle timeout. A disconnected upload releases its admission and cannot escape the native request error boundary. Upload downloads stream from disk instead of loading the whole file.
- At most 2 image workers run concurrently, and one worker polls for at most 15 minutes, with backoff on upstream errors. Existing running task IDs remain durable. Old tasks are excluded from automatic polling, but a client can still query the original ID (one upstream GET, with a bounded cooldown); no timeout triggers a new provider POST. Reservation expiry and delivery/once-only settlement rules remain intact.
- Synchronous SQLite busy waits are bounded at 100ms rather than 5 seconds. Initialization failures close their SQLite handle. An unavailable wallet fails closed and is retryable.

## Host controls

`scripts/vps-stability-hardening.py --apply` requires systemd/cgroup v2, a healthy baseline and no active media work. It preserves inspected environment, image, command, user, ports, networks and all named/anonymous storage mounts. It replaces one container at a time and verifies runtime settings/health, retaining the old container for rollback. Failure restores that container before stopping the rollout.

- All 7 application containers share `keyo-services.slice`: **512MiB physical memory, 128MiB swap**, leaving about 383MiB physical memory outside the pool for Caddy/SSH/Docker/OS services. Per-container ceilings apply within this pool; they are not additive reservations. A pool OOM can restart an application container; admission controls reduce that risk, but the setting is not an uptime guarantee.
- Aggregate application root-disk limits start at **900 read IOPS / 600 write IOPS**. These are conservative operating limits, not a claim about the cloud disk's contracted performance. The installer checks actual cgroup `io.max`, `memory.max` and `memory.swap.max` before moving containers. Host processes outside the slice remain separately observable.
- JSON Docker logs rotate at 10MiB × 3 per container unless an existing custom policy is present. Console and moderation deployments preserve resource/log/cgroup settings; native/Gitee builders already preserve HostConfig. No Docker daemon restart or VPS reboot is required.
- A 15-second resource recorder captures CPU composition, memory/refault/swap/PSI, per-process CPU and actual disk reads/writes, and per-minute local health. It records process names, not command lines, environment, request bodies or database contents. Files are root-only and rotate within **15MiB**. The recorder has a 48MiB memory and 5% single-core CPU ceiling.
- A 12-hour retention timer keeps the newest two recognized stopped rollback containers plus every backup stopped less than 24 hours ago. It never deletes volumes and only attempts non-forced removal of an unreferenced image from a deleted backup. Closed `oneapi-YYYYMMDDHHMMSS.log` files are retained within a 200MiB / 7-day target, preserving the newest two, recent files and open descriptors. Successful safe-pulls remove their own temporary blog backup; failed restores retain it.

## Verification and rollback

Offline tests cover actual concurrent/chunked HTTP uploads, mid-upload disconnect, refusal before wallet reservation, retained async media budget, bounded polling/restart/query, reference integrity, once-only accounting, inspected storage preservation, failed replacement rollback, and conservative retention. No paid or free generation model is called for live acceptance; live checks use GET metadata/health only.

For a resource rollback, adjust the managed slice limits through systemd and verify the resulting cgroup files before resuming traffic. Per-container old instances remain named in the sanitized rollout output and can restore their exact original configuration. The recorder can be stopped independently with `systemctl disable --now keyo-stability-recorder.service`; this does not stop application containers.

Implementation references: [systemd resource control](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html), [Docker limits](https://docs.docker.com/engine/containers/resource_constraints/).

## Rollout evidence

Pending deployment and live verification; do not treat prepared controls as already applied.
