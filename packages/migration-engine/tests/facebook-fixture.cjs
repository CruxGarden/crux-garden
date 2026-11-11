const metadataPath = "posts/your_posts_1.json";
const post = (media) => ({
  timestamp: 123,
  title: "Post <script>fixture</script>",
  attachments: [{ data: media.map((media) => ({ media })) }],
  data: [{ post: "Keep the whole post" }],
});
const entries = {
  [metadataPath]: JSON.stringify([
    post([
      { uri: "photos_and_videos/your_posts/video", creation_timestamp: 0 },
      { uri: "photos_and_videos/your_posts/missing.jpg" },
      { uri: "https://never-fetch.invalid/media" },
    ]),
    {
      timestamp: 124,
      title: "Text only",
      attachments: [],
      data: [{ post: "Text remains" }],
    },
  ]),
  "photos_and_videos/your_posts/video": "synthetic extensionless clip",
  "your_activity_across_facebook/posts/your_posts_1.json": JSON.stringify([
    post([{ uri: "unknown" }]),
  ]),
};
module.exports = { entries, metadataPath, post };
