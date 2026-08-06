const fs = require('fs');

let code = fs.readFileSync('src/services/liveService.ts', 'utf8');

const catchBlock = `
    } catch (error: any) {
      console.error("Failed to start Live Session:", error);
      if (error?.message?.includes("Permission denied") || error?.name === "NotAllowedError") {
        this.onMessage("venom", "Microphone access was denied. Please allow microphone permissions, or if you are in the AI Studio preview, open the app in a new tab by clicking the arrow in the top right.");
      } else {
        this.onMessage("venom", "Failed to start live session: " + (error?.message || "Unknown error"));
      }
      this.stop();
    }
  }
`;

code = code.replace(/\} catch \(error\) \{[\s\S]*?this\.stop\(\);\s*\}/, catchBlock.trim());

fs.writeFileSync('src/services/liveService.ts', code);
