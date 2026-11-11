const metadataPath = "data/tweets.js";
const wrap = (posts, part = 0, family = "tweets") =>
  `window.YTD.${family}.part${part} = ${JSON.stringify(posts)};`;
const tweet = (media = [], id = "9007199254740993123") => ({
  tweet: {
    id_str: id,
    full_text: "Post <script>fixture</script>",
    created_at: "Mon Jan 01 00:00:00 +0000 2024",
    extended_entities: { media },
  },
});
const photo = (name = "Photo", extra = {}) => ({
  type: "photo",
  media_url_https: `https://pbs.twimg.com/media/${name}.jpg`,
  ...extra,
});
const entries = {
  [metadataPath]: wrap([
    tweet([photo(), photo("Missing"), photo("Poster", { type: "video" })]),
  ]),
  "data/tweets_media/9007199254740993123-Photo.jpg": "synthetic photo",
  "data/direct-messages.js": "window.YTD.direct_messages.part0 = [];",
};
module.exports = { metadataPath, wrap, tweet, photo, entries };
