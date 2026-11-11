const metadataPath = "your_instagram_activity/media/posts_1.json";
const entries = {
  [metadataPath]: JSON.stringify([
    {
      media: [
        {
          uri: "media/posts/video",
          title: "Clip <script>fixture</script>",
          creation_timestamp: 0,
        },
        { uri: "media/posts/missing.jpg" },
        { uri: "https://never-fetch.invalid/media" },
      ],
    },
  ]),
  "media/posts/video": "synthetic extensionless video",
  "your_instagram_activity/media/unknown.json": JSON.stringify({
    label_values: [],
  }),
};
module.exports = { entries, metadataPath };

const labeledPath = "your_instagram_activity/media/posts.json";
const labeledEntries = {
  [labeledPath]: JSON.stringify([
    {
      timestamp: 1430000000,
      media: [],
      fbid: "90071992547409999",
      label_values: [
        { label: "Creation time", timestamp_value: 0 },
        { label: "Media", media: JSON.parse(entries[metadataPath])[0].media },
      ],
    },
  ]),
  "media/posts/video": entries["media/posts/video"],
};
module.exports.labeledPath = labeledPath;
module.exports.labeledEntries = labeledEntries;
