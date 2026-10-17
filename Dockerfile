FROM public.ecr.aws/lambda/nodejs:20 AS build

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

FROM public.ecr.aws/lambda/nodejs:20
WORKDIR ${LAMBDA_TASK_ROOT}
COPY --from=build /var/task/dist ./dist

# Start the bundled handler without build dependencies before publishing.
RUN AWS_LAMBDA_FUNCTION_NAME=build-check node -e \
    'const { handler } = require("./dist/index.js"); \
    handler({httpMethod:"GET",path:"/api/health",headers:{}},{}).then(response => { \
      if(response.statusCode !== 200 || !JSON.parse(response.body).ok) \
        throw Error("Bundled handler is unhealthy"); \
    })'

ARG APP_COMMIT=development
ENV APP_COMMIT=${APP_COMMIT}

# Set the handler - Lambda expects handler function name
CMD ["dist/index.handler"]
