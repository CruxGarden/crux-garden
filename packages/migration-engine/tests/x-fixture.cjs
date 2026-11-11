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
const video = (type = "video") =>
  photo("Poster", {
    type,
    video_info: {
      variants: [
        {
          content_type: "video/mp4",
          bitrate: 256000,
          url: "https://video.twimg.com/ext_tw_video/123/pu/vid/320x180/Clip.mp4",
        },
        {
          content_type: "video/mp4",
          bitrate: 832000,
          url: "https://video.twimg.com/ext_tw_video/123/pu/vid/640x360/MissingClip.mp4",
        },
      ],
    },
  });
const playbackEntries = {
  [metadataPath]: wrap([
    tweet([
      video(),
      photo("Poster", {
        type: "animated_gif",
        video_info: {
          variants: [
            {
              content_type: "video/mp4",
              url: "https://video.twimg.com/tweet_video/Loop.mp4",
            },
          ],
        },
      }),
    ]),
  ]),
  "data/tweets_media/9007199254740993123-Clip.mp4": "synthetic playback",
  "data/tweets_media/9007199254740993123-Loop.mp4": "synthetic loop playback",
  "data/tweets_media/9007199254740993123-Poster.jpg":
    "poster remains uninterpreted",
};
const entries = {
  [metadataPath]: wrap([
    tweet([photo(), photo("Missing"), photo("Poster", { type: "video" })]),
  ]),
  "data/tweets_media/9007199254740993123-Photo.jpg": "synthetic photo",
  "data/direct-messages.js": "window.YTD.direct_messages.part0 = [];",
};
module.exports = {
  metadataPath,
  wrap,
  tweet,
  photo,
  entries,
  video,
  playbackEntries,
};
