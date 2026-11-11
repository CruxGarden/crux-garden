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
  "your_instagram_activity/media/posts.json": JSON.stringify({
    label_values: [],
  }),
};
module.exports = { entries, metadataPath };
