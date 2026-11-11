import icon0 from "./assets/services/airtable.svg";
import icon1 from "./assets/services/apple-notes.svg";
import icon2 from "./assets/services/asana.svg";
import icon3 from "./assets/services/atlassian-trello.svg";
import icon4 from "./assets/services/bluesky.svg";
import icon5 from "./assets/services/discord.svg";
import icon6 from "./assets/services/dropbox.svg";
import icon7 from "./assets/services/evernote.svg";
import icon8 from "./assets/services/facebook.svg";
import icon9 from "./assets/services/flickr.svg";
import icon10 from "./assets/services/gmail.svg";
import icon11 from "./assets/services/google-calendar.svg";
import icon12 from "./assets/services/google-contacts.svg";
import icon13 from "./assets/services/google-drive.svg";
import icon14 from "./assets/services/google-keep.svg";
import icon15 from "./assets/services/google-photos.svg";
import icon16 from "./assets/services/icloud.svg";
import icon17 from "./assets/services/instagram.svg";
import icon18 from "./assets/services/medium.svg";
import icon19 from "./assets/services/microsoft-onedrive.svg";
import icon20 from "./assets/services/microsoft-onenote.svg";
import icon21 from "./assets/services/notion.svg";
import icon22 from "./assets/services/reddit.svg";
import icon23 from "./assets/services/s3.svg";
import icon24 from "./assets/services/slack.svg";
import icon25 from "./assets/services/telegram.svg";
import icon26 from "./assets/services/todoist.svg";
import icon27 from "./assets/services/whatsapp.svg";
import icon28 from "./assets/services/wordpress.svg";
import icon29 from "./assets/services/x.svg";
import icon30 from "./assets/services/youtube.svg";

const icons: Record<string, string> = {
  Dropbox: icon6,
  "Google Drive": icon13,
  "Google Photos": icon15,
  "iCloud Photos": icon16,
  Gmail: icon10,
  "Amazon S3": icon23,
  "iCloud Drive": icon16,
  "iCloud Messages": icon16,
  OneDrive: icon19,
  Facebook: icon8,
  Instagram: icon17,
  WhatsApp: icon27,
  Notion: icon21,
  Evernote: icon7,
  OneNote: icon20,
  "Google Keep": icon14,
  "Google Calendar": icon11,
  "Google Contacts": icon12,
  Trello: icon3,
  Asana: icon2,
  Todoist: icon26,
  Airtable: icon0,
  Slack: icon24,
  Discord: icon5,
  Telegram: icon25,
  X: icon29,
  Reddit: icon22,
  YouTube: icon30,
  WordPress: icon28,
  Medium: icon18,
  Bluesky: icon4,
  "Apple Notes": icon1,
  Flickr: icon9,
};

/** Brand artwork is bundled locally; the surrounding surface follows the host Mood. */
export function ServiceIcon({ service }: { service: string }) {
  const src = icons[service];
  if (!src) return null;
  return (
    <span className="service-icon" aria-hidden="true">
      <img src={src} alt="" width="24" height="24" draggable={false} />
    </span>
  );
}
