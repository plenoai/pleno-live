FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install pnpm and dependencies
RUN npm install -g pnpm@9.12.0 && \
    pnpm install --frozen-lockfile

# Copy application code and dependencies
COPY apps/server ./apps/server
COPY packages ./packages
COPY tsconfig.json ./

# Build main application (CommonJS for Lambda compatibility)
# jose v6 is ESM-only, so we bundle all deps to avoid require() of ESM errors
RUN npx esbuild apps/server/_core/index.ts \
    --platform=node \
    --bundle \
    --format=cjs \
    --outfile=dist/index.js

ARG APP_COMMIT=development
ENV APP_COMMIT=${APP_COMMIT}

# Set the handler - Lambda expects handler function name
CMD ["dist/index.handler"]
