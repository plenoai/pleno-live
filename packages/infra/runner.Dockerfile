# CodeBuild GitHub Actions Runner image with Android SDK pre-installed
# ベース: CodeBuild standard:7.0 互換 (Ubuntu 22.04)
FROM public.ecr.aws/codebuild/standard:7.0

# Android SDK バージョン
ARG ANDROID_BUILD_TOOLS_VERSION=34.0.0
ARG ANDROID_PLATFORM_VERSION=34
ARG CMDLINE_TOOLS_VERSION=11076708

ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH="${PATH}:${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/platform-tools"

# Android command-line tools のインストール
RUN mkdir -p ${ANDROID_SDK_ROOT}/cmdline-tools && \
    curl -sSL "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS_VERSION}_latest.zip" -o /tmp/cmdline-tools.zip && \
    unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-tools && \
    mv /tmp/cmdline-tools/cmdline-tools ${ANDROID_SDK_ROOT}/cmdline-tools/latest && \
    rm -rf /tmp/cmdline-tools.zip /tmp/cmdline-tools

# Android SDK コンポーネントのインストール（ライセンス自動承諾）
RUN yes | sdkmanager --licenses > /dev/null && \
    sdkmanager \
      "platform-tools" \
      "build-tools;${ANDROID_BUILD_TOOLS_VERSION}" \
      "platforms;android-${ANDROID_PLATFORM_VERSION}"

# Gradle wrapper キャッシュ用ディレクトリ
RUN mkdir -p /root/.gradle

# Node.js / pnpm は actions/setup-node で管理するため不要
