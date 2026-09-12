# syntax=docker/dockerfile:1
#
# Two stages: a full Maven/JDK image to build the jar, a JRE-only image to run
# it. The build tooling — Maven, the JDK, the whole ~/.m2 tree — never reaches
# the shipped image, which is the point: a container that can compile arbitrary
# Java is a container that can compile whatever an attacker uploads to it.

# ── Build ──────────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# pom.xml on its own first, so the dependency download is a separate layer from
# the source. Editing a controller then rebuilds in seconds instead of
# re-resolving every artifact in the tree.
COPY pom.xml ./

# Warm the local repository. `|| true` because go-offline is a best-effort
# optimisation: it resolves plugin dependencies eagerly and some plugins (the
# Kotlin one here) report artifacts it cannot pre-fetch. A failure here must not
# fail the build — the real `package` below resolves whatever is still missing.
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp dependency:go-offline || true

COPY src ./src

# Tests do not run here. They need Testcontainers, which needs a Docker daemon
# inside the build — CI already runs `verify` on every push, and a deploy that
# re-runs the suite on the VPS is paying for the same signal twice, slowly.
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp -DskipTests package

# ── Runtime ────────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-jammy AS runtime

# curl is here for the container healthcheck and nothing else. A JRE image has
# no HTTP client on the PATH, and Compose's healthcheck runs a shell command,
# not a Java one.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app

WORKDIR /app

# The glob matches event-booking-api-<version>.jar and NOT the
# .jar.original that spring-boot-maven-plugin leaves beside it.
COPY --from=build /build/target/event-booking-api-*.jar app.jar

# Created in the image, not by the volume mount, so the named volume Compose
# attaches here inherits app:app ownership instead of landing as root-owned and
# unwritable.
RUN mkdir -p /app/logs && chown -R app:app /app

USER app
EXPOSE 8080

# MaxRAMPercentage, not -Xmx: the JVM reads the container's cgroup limit, so the
# heap tracks whatever mem_limit the VPS can afford without the number being
# restated in two places. ExitOnOutOfMemoryError makes a heap exhaustion a
# restart (Compose brings it back) rather than a process that stays up serving
# errors forever.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError -Duser.timezone=UTC" \
    TZ=UTC

HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
  CMD curl -fsS http://localhost:8080/actuator/health || exit 1

# Shell form so $JAVA_OPTS expands; `exec` so java becomes PID 1 and receives
# SIGTERM directly. Without it, `docker stop` kills the shell and the JVM gets
# the 10-second SIGKILL instead of a graceful shutdown — which, mid-checkout,
# means holds that never get released cleanly.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
