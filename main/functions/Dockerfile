# Dockerfile for Cloud Run deployment of the translate proxy
# Build image:  docker build -t bolcha-translate .
# Tested with GCP Cloud Build / Cloud Run

FROM node:18-slim

# Create app directory
WORKDIR /app

# Copy package files first for better cache utilisation
COPY package*.json ./

# Install prod deps (firebase-* not needed on Cloud Run, but harmless)
RUN npm ci --only=production \
    && npm install @google-cloud/functions-framework@^3.3.0 --save-exact --no-audit --omit=dev

# Copy source
COPY . .

# Cloud Functions Framework expects PORT env; Cloud Run sets PORT automatically
ENV PORT=8080

# Expose for local run (optional)
EXPOSE 8080

# Launch the exported function "translate" in index.js
CMD ["npx", "functions-framework", "--target", "translate"]
