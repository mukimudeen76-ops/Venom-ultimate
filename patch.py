import re

with open('.github/workflows/android-build.yml', 'r') as f:
    content = f.read()

replacement = """      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v3

      - name: Create .env file
        run: |
          cat <<ENV_EOF > .env
          FIREBASE_API_KEY=${{ secrets.FIREBASE_API_KEY }}
          FIREBASE_AUTH_DOMAIN=${{ secrets.FIREBASE_AUTH_DOMAIN }}
          FIREBASE_PROJECT_ID=${{ secrets.FIREBASE_PROJECT_ID }}
          FIREBASE_STORAGE_BUCKET=${{ secrets.FIREBASE_STORAGE_BUCKET }}
          FIREBASE_MESSAGING_SENDER_ID=${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}
          FIREBASE_APP_ID=${{ secrets.FIREBASE_APP_ID }}
          ENV_EOF

      - name: Create google-services.json
        run: |
          echo "${{ secrets.GOOGLE_SERVICES_JSON_BASE64 }}" | base64 --decode > android/app/google-services.json

      - name: Setup and Fix Gradle Wrapper"""

content = content.replace("      - name: Setup Gradle\n        uses: gradle/actions/setup-gradle@v3\n      - name: Setup and Fix Gradle Wrapper", replacement)

with open('.github/workflows/android-build.yml', 'w') as f:
    f.write(content)
