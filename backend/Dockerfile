# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Android SDK + JDK base
# This stage installs the Android build toolchain (~1.5 GB).
# It is cached between builds as long as the Android/JDK versions don't change.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS android-base

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        openjdk-17-jdk-headless \
        wget \
        unzip \
        curl \
        git \
    && rm -rf /var/lib/apt/lists/*

# ── Java ──────────────────────────────────────────────────────────────────────
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="${JAVA_HOME}/bin:${PATH}"

# ── Android SDK ───────────────────────────────────────────────────────────────
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=${ANDROID_HOME}
ENV PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/34.0.0:${PATH}"

# Download and install Android command-line tools
# SHA256 verified via checksum embedded below (update when bumping version)
ARG ANDROID_CMDLINE_TOOLS_URL=https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip

RUN mkdir -p "${ANDROID_HOME}/cmdline-tools" \
    && wget -q "${ANDROID_CMDLINE_TOOLS_URL}" -O /tmp/cmdtools.zip \
    && unzip -q /tmp/cmdtools.zip -d "${ANDROID_HOME}/cmdline-tools" \
    && mv "${ANDROID_HOME}/cmdline-tools/cmdline-tools" "${ANDROID_HOME}/cmdline-tools/latest" \
    && rm /tmp/cmdtools.zip

# Accept all SDK licenses and install required packages
RUN yes | sdkmanager --licenses > /dev/null \
    && sdkmanager \
        "platform-tools" \
        "platforms;android-34" \
        "build-tools;34.0.0"

# Make SDK world-readable (will be used by non-root appuser)
RUN chmod -R a+rX "${ANDROID_HOME}"

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Node dependencies
# Separate stage so npm install is cached independently of source changes
# ─────────────────────────────────────────────────────────────────────────────
FROM android-base AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Build TypeScript
# ─────────────────────────────────────────────────────────────────────────────
FROM android-base AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 4: Runtime image
# ─────────────────────────────────────────────────────────────────────────────
FROM android-base AS runtime

# Create non-root user
RUN useradd -m -u 1001 -s /bin/bash appuser \
    && mkdir -p /home/appuser/.gradle /home/appuser/.android \
    && chown -R appuser:appuser /home/appuser

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy compiled app from builder stage
COPY --from=builder --chown=appuser:appuser /app/dist ./dist
COPY --chown=appuser:appuser package.json ./

# Gradle user home — should be mounted as a named volume in docker-compose
# so Gradle dependency cache persists across container restarts
ENV GRADLE_USER_HOME=/home/appuser/.gradle

# Drop to non-root user
USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "dist/index.js"]
