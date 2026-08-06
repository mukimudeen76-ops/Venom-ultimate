import { NativeBridge } from "./nativeBridge";
import { reminderService } from "./reminderService";

export interface CommandResult {
  action: string;
  url?: string;
  isBrowserAction: boolean;
  nativeHandled?: boolean;
}

export function processCommand(command: string): CommandResult {
  const lowerCmd = command.toLowerCase().trim();

  // Reminder / Alarm / Timer parse check
  const reminderParsed = reminderService.parseNaturalCommand(command);
  if (reminderParsed.isReminder && reminderParsed.reply) {
    return {
      action: reminderParsed.reply,
      isBrowserAction: true,
      nativeHandled: true
    };
  }

  // Close app / Go Home / Go Back
  if (
    lowerCmd === "close app" ||
    lowerCmd === "go home" ||
    lowerCmd === "exit app" ||
    lowerCmd === "minimize" ||
    lowerCmd.startsWith("close ")
  ) {
    const res = NativeBridge.closeApp();
    return {
      action: res.message,
      isBrowserAction: true,
      nativeHandled: NativeBridge.isAndroidNative(),
    };
  }

  if (lowerCmd === "go back" || lowerCmd === "back") {
    const res = NativeBridge.goBack();
    return {
      action: res.message,
      isBrowserAction: true,
      nativeHandled: NativeBridge.isAndroidNative(),
    };
  }

  // Flashlight control
  if (lowerCmd.includes("turn on flashlight") || lowerCmd.includes("flashlight on") || lowerCmd === "torch on" || lowerCmd === "lights on" || lowerCmd === "torch") {
    const res = NativeBridge.toggleFlashlight(true);
    return { action: res.message, isBrowserAction: true, nativeHandled: true };
  }
  if (lowerCmd.includes("turn off flashlight") || lowerCmd.includes("flashlight off") || lowerCmd === "torch off" || lowerCmd === "lights off") {
    const res = NativeBridge.toggleFlashlight(false);
    return { action: res.message, isBrowserAction: true, nativeHandled: true };
  }

  // Camera / Screenshot
  if (lowerCmd.includes("take a photo") || lowerCmd === "open camera" || lowerCmd === "camera") {
    const res = NativeBridge.takePhoto();
    return { action: res, isBrowserAction: true, nativeHandled: true };
  }
  if (lowerCmd.includes("screenshot") || lowerCmd.includes("capture screen")) {
    const res = NativeBridge.captureNativeScreen();
    return { action: res ? "Capturing screen..." : "Screen capture failed.", isBrowserAction: true, nativeHandled: true };
  }

  // System Settings Quick Access
  if (lowerCmd === "open wifi" || lowerCmd === "wifi settings") {
    const res = NativeBridge.openSettingsScreen("WIFI");
    return { action: res, isBrowserAction: true, nativeHandled: true };
  }
  if (lowerCmd === "open bluetooth" || lowerCmd === "bluetooth settings") {
    const res = NativeBridge.openSettingsScreen("BLUETOOTH");
    return { action: res, isBrowserAction: true, nativeHandled: true };
  }

  // Battery check
  if (lowerCmd.includes("battery") || lowerCmd.includes("battery level") || lowerCmd.includes("charge status")) {
    return {
      action: "Checking device battery status...",
      isBrowserAction: true,
      nativeHandled: true,
    };
  }

  // Wake Up Commands
  if (
    lowerCmd === "wake up venom" || 
    lowerCmd === "wake venom" || 
    lowerCmd === "wakeupvenom" || 
    lowerCmd === "hey venom" || 
    lowerCmd === "activate venom"
  ) {
    return {
      action: "WAKING_UP",
      isBrowserAction: true,
      nativeHandled: false
    };
  }

  // Read Notifications
  if (lowerCmd.includes("read notification") || lowerCmd.includes("check notification") || lowerCmd.includes("read messages")) {
    const notifications = NativeBridge.readNotifications();
    if (notifications.length === 0) {
      return { action: "You have no unread notifications right now.", isBrowserAction: true, nativeHandled: true };
    }
    const summary = notifications.map(n => `${n.title}: "${n.text}"`).join("; ");
    return { action: `Here are your recent notifications: ${summary}`, isBrowserAction: true, nativeHandled: true };
  }

  // Call contact command: "Call [name]"
  const callMatch = lowerCmd.match(/^call\s+(.+)$/);
  if (callMatch) {
    const targetName = callMatch[1].trim();
    const contacts = NativeBridge.resolveContact(targetName);
    if (contacts.length === 0) {
      return { action: `Could not find any contact named "${targetName}" in your address book.`, isBrowserAction: true, nativeHandled: true };
    }
    if (contacts.length > 1) {
      const choices = contacts.map(c => `${c.name} (${c.number})`).join(", ");
      return { action: `Multiple contacts match "${targetName}": ${choices}. Which one would you like to call?`, isBrowserAction: true, nativeHandled: true };
    }
    const matched = contacts[0];
    NativeBridge.callContact(matched.number);
    return { action: `Placing call to ${matched.name} (${matched.number})...`, isBrowserAction: true, nativeHandled: true };
  }

  // --- REFINED SMART YOUTUBE SEARCH & PLAY PARSING ---
  let ytQuery = "";
  let isPlayCommand = false;

  // Exact "open youtube" or "open yt" matches
  if (lowerCmd === "open youtube" || lowerCmd === "open yt" || lowerCmd === "youtube" || lowerCmd === "yt") {
    return {
      action: "Opening YouTube in a new tab.",
      url: "https://www.youtube.com",
      isBrowserAction: true,
    };
  }

  // Regex patterns for matching YouTube intent:
  // 1. "open youtube and search [query]" or "open youtube to search [query]" or "open youtube search [query]"
  const openYtSearchMatch = lowerCmd.match(/^open\s+(?:youtube|yt)\s+(?:and\s+search\s+|to\s+search\s+|search\s+)(.+)$/);
  // 2. "open youtube and play [query]" or "open youtube to play [query]" or "open youtube play [query]"
  const openYtPlayMatch = lowerCmd.match(/^open\s+(?:youtube|yt)\s+(?:and\s+play\s+|to\s+play\s+|play\s+)(.+)$/);
  // 3. "play [query] on youtube" or "play [query] on yt"
  const playOnYtMatch = lowerCmd.match(/^play\s+(.+?)\s+on\s+(?:youtube|yt)$/);
  // 4. "search [query] on youtube" or "search [query] on yt"
  const searchOnYtMatch = lowerCmd.match(/^search\s+(.+?)\s+on\s+(?:youtube|yt)$/);
  // 5. "youtube [query]" or "yt [query]"
  const ytPrefixMatch = lowerCmd.match(/^(?:youtube|yt)\s+(.+)$/);
  // 6. "open youtube [query]" or "open yt [query]"
  const openYtQueryMatch = lowerCmd.match(/^open\s+(?:youtube|yt)\s+(.+)$/);
  // 7. General "play [query]" (if not matching on spotify, play on youtube by default!)
  const generalPlayMatch = lowerCmd.match(/^play\s+(.+)$/);

  if (openYtSearchMatch) {
    ytQuery = openYtSearchMatch[1].trim();
  } else if (openYtPlayMatch) {
    ytQuery = openYtPlayMatch[1].trim();
    isPlayCommand = true;
  } else if (playOnYtMatch) {
    ytQuery = playOnYtMatch[1].trim();
    isPlayCommand = true;
  } else if (searchOnYtMatch) {
    ytQuery = searchOnYtMatch[1].trim();
  } else if (ytPrefixMatch) {
    ytQuery = ytPrefixMatch[1].trim();
    if (ytQuery.startsWith("play ")) {
      ytQuery = ytQuery.substring(5).trim();
      isPlayCommand = true;
    } else if (ytQuery.startsWith("search ")) {
      ytQuery = ytQuery.substring(7).trim();
    }
  } else if (openYtQueryMatch) {
    const subQuery = openYtQueryMatch[1].trim();
    if (subQuery.startsWith("and search ")) {
      ytQuery = subQuery.substring(11).trim();
    } else if (subQuery.startsWith("and play ")) {
      ytQuery = subQuery.substring(9).trim();
      isPlayCommand = true;
    } else if (subQuery.startsWith("to play ")) {
      ytQuery = subQuery.substring(8).trim();
      isPlayCommand = true;
    } else if (subQuery.startsWith("to search ")) {
      ytQuery = subQuery.substring(10).trim();
    } else {
      ytQuery = subQuery;
    }
  } else if (generalPlayMatch && !lowerCmd.includes("on spotify")) {
    ytQuery = generalPlayMatch[1].trim();
    isPlayCommand = true;
  }

  if (ytQuery) {
    const encodedQuery = encodeURIComponent(ytQuery);
    if (isPlayCommand) {
      return {
        action: `Opening YouTube to play "${ytQuery}". It will automatically play the first video in a new tab.`,
        url: `https://www.youtube.com/embed?listType=search&list=${encodedQuery}&autoplay=1`,
        isBrowserAction: true,
      };
    } else {
      return {
        action: `Searching YouTube for "${ytQuery}" in a new tab.`,
        url: `https://www.youtube.com/results?search_query=${encodedQuery}`,
        isBrowserAction: true,
      };
    }
  }

  // Media Search: "Search [query] on Spotify"
  const spotifyMatch = lowerCmd.match(/^search\s+(.+?)\s+on\s+spotify$/);
  if (spotifyMatch) {
    const query = encodeURIComponent(spotifyMatch[1].trim());
    return {
      action: `Searching ${spotifyMatch[1]} on Spotify.`,
      url: `https://open.spotify.com/search/${query}`,
      isBrowserAction: true,
    };
  }

  // WhatsApp Message
  const waMatch = lowerCmd.match(
    /^send\s+a?\s*whatsapp\s+message\s+to\s+([\d\+\s\w]+)\s+saying\s+(.+)$/
  );
  if (waMatch) {
    const target = waMatch[1].trim();
    const message = waMatch[2].trim();
    const res = NativeBridge.openApp("WhatsApp");
    return {
      action: `Preparing WhatsApp message to ${target}: "${message}".`,
      url: `https://web.whatsapp.com/send?phone=${encodeURIComponent(target)}&text=${encodeURIComponent(message)}`,
      isBrowserAction: true,
    };
  }

  // Mute / Unmute / Stop
  if (lowerCmd === "mute" || lowerCmd === "stop talking" || lowerCmd === "shut up" || lowerCmd === "be quiet") {
    return { action: "MUTING", isBrowserAction: true, nativeHandled: false };
  }
  if (lowerCmd === "unmute" || lowerCmd === "speak" || lowerCmd === "talk") {
    return { action: "UNMUTING", isBrowserAction: true, nativeHandled: false };
  }
  if (lowerCmd === "stop" || lowerCmd === "cancel") {
    return { action: "STOP_ALL", isBrowserAction: true, nativeHandled: false };
  }

  // Volume Control
  if (lowerCmd.includes("volume up") || lowerCmd.includes("increase volume")) {
    const res = NativeBridge.setVolume("UP");
    return { action: res, isBrowserAction: true, nativeHandled: true };
  }
  if (lowerCmd.includes("volume down") || lowerCmd.includes("decrease volume")) {
    const res = NativeBridge.setVolume("DOWN");
    return { action: res, isBrowserAction: true, nativeHandled: true };
  }

  // Brightness Control
  if (lowerCmd.includes("brightness up") || lowerCmd.includes("increase brightness")) {
    const res = NativeBridge.setBrightness("UP");
    return { action: res, isBrowserAction: true, nativeHandled: true };
  }
  if (lowerCmd.includes("brightness down") || lowerCmd.includes("decrease brightness")) {
    const res = NativeBridge.setBrightness("DOWN");
    return { action: res, isBrowserAction: true, nativeHandled: true };
  }

  // Volume Control
  if (lowerCmd.includes("volume up") || lowerCmd.includes("increase volume")) {
    const res = NativeBridge.setVolume("UP");
    return { action: res, isBrowserAction: true, nativeHandled: true };
  }
  if (lowerCmd.includes("volume down") || lowerCmd.includes("decrease volume")) {
    const res = NativeBridge.setVolume("DOWN");
    return { action: res, isBrowserAction: true, nativeHandled: true };
  }

  // Brightness Control
  if (lowerCmd.includes("brightness up") || lowerCmd.includes("increase brightness")) {
    const res = NativeBridge.setBrightness("UP");
    return { action: res, isBrowserAction: true, nativeHandled: true };
  }
  if (lowerCmd.includes("brightness down") || lowerCmd.includes("decrease brightness")) {
    const res = NativeBridge.setBrightness("DOWN");
    return { action: res, isBrowserAction: true, nativeHandled: true };
  }

  // App launch or website open: "Open [appName or website]"
  const openMatch = lowerCmd.match(/^open\s+(.+)$/);
  if (openMatch) {
    const target = openMatch[1].trim();
    const res = NativeBridge.openApp(target);
    return {
      action: res.message,
      url: target.includes(".") ? `https://${target}` : `https://www.${target}.com`,
      isBrowserAction: true,
      nativeHandled: NativeBridge.isAndroidNative(),
    };
  }

  return { action: "", isBrowserAction: false };
}
