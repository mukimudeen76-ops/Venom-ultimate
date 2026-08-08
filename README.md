# Personal Venom Assistant (VENOM) - Level 1000+ Sovereign Entity

> 🤖 **FOR AI AGENTS & DEVELOPERS:** To extract, replicate, or copy VENOM's exact persona prompt, voice system, real-time live WebSocket audio engine, or UI design, read the complete guide in [`/VENOM_AGENT_GUIDE.md`](./VENOM_AGENT_GUIDE.md).

### 🌐 Live Application Links
* **Interactive App URL:** `https://ais-dev-3hzjl23a2mrpsyt2juxg4y-59404293463.asia-east1.run.app`
* **Shared Production App URL:** `https://ais-pre-3hzjl23a2mrpsyt2juxg4y-59404293463.asia-east1.run.app`

---

## 📱 About the Project

**Personal Venom Assistant (VENOM)** is a sassy, witty, intelligent, and ultra-responsive personal AI voice assistant engineered specifically for Android devices. VENOM combines high-speed Gemini AI models with Firebase real-time data persistence and a visual soundwave engine to deliver a unique personal assistant experience directly on Android.

---

## 🌟 Key Capabilities & Features

- **🎙️ Real-time Voice Interaction**: Hands-free voice interface featuring real-time speech processing and natural audio synthesis tuned for a sassy, entertaining persona.
- **⚡ Sassy & Witty AI Core**: Powered by Google's Gemini models (`@google/genai`) for rapid context-aware responses and custom AI personality parameters.
- **🧠 Memory Vault**: Persistent memory and user preferences store managed via Firebase Cloud Firestore, allowing VENOM to recall long-term user context across sessions.
- **🔐 Secure Firebase Auth**: User authentication and privacy controls for personal memory vaults and custom settings.
- **📊 Dynamic Audio Waveform Visualizer**: Live canvas soundwave rendering during active listening and voice output.
- **🤖 Automated Android CI/CD Pipeline**: Built-in GitHub Actions workflow (`.github/workflows/android-build.yml`) for automated release APK compilation and packaging using Gradle.

---

## 🛠️ Project Structure & Android Environment

```text
├── android/                   # Native Android wrapper & Gradle configuration
│   ├── app/                   # Android app module (build.gradle, AndroidManifest.xml)
│   ├── gradle/wrapper/        # Gradle wrapper distribution
│   └── gradlew                # Gradle executable script
├── .github/
│   └── workflows/
│       └── android-build.yml  # CI/CD workflow for automated native APK compilation
├── src/
│   ├── components/            # UI components & visualizer modules
│   ├── lib/                   # Firebase initialization & Android bridge configurations
│   ├── services/              # Gemini AI service integration & voice processors
│   └── App.tsx                # Main application view & voice state machine
└── package.json               # Development toolchain and bundle settings
```

---

## 🚀 Building the Native Android APK

### Prerequisites
- **Android SDK & Build Tools** (API Level 33+)
- **Java JDK 17**
- **Gradle 8.x**

### Local Build Steps
1. Navigate to the Android directory:
   ```bash
   cd android
   ```
2. Make the Gradle wrapper executable:
   ```bash
   chmod +x gradlew
   ```
3. Assemble the release Android APK:
   ```bash
   ./gradlew assembleRelease
   ```
4. Find your compiled APK at:
   `android/app/build/outputs/apk/release/app-release.apk`

---

## 🤖 GitHub Actions CI/CD (APK Build Workflow)

This project features an automated GitHub Actions workflow (`.github/workflows/android-build.yml`) that builds release APK artifacts on every main push or version tag (`v*`).

To configure automated builds:
1. Store your `google-services.json` as a base64-encoded secret in GitHub Secrets (`GOOGLE_SERVICES_JSON_BASE64`).
2. Supply Firebase credentials (`FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, etc.) as repository secrets.

---

## 🔒 License & Legal Restrictions

**PROPRIETARY & CONFIDENTIAL SOFTWARE**

Personal Venom Assistant is a strictly **proprietary native Android application**. 

- **NO UNAUTHORIZED USE**: downloading, modifying, forking, reverse-engineering, decompiling, or redistributing this application or its Android source code is strictly prohibited.
- **PERSONAL NON-COMMERCIAL USE ONLY**: Permission is limited strictly to downloading the compiled software for personal, non-commercial evaluation on an authorized Android device.
- **LEGAL ACTION**: Any unauthorized distribution, modification, or forking of this repository will result in immediate legal action under copyright and intellectual property laws.

For complete terms, see the [LICENSE](./LICENSE) file.

