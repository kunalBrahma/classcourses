const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export type YouTubeLink = { id: string; isShort: boolean };

// Accepts a bare 11-char id or any common YouTube URL form:
// watch?v=, youtu.be/, /embed/, /shorts/, /live/, m.youtube.com, youtube-nocookie.com.
// isShort is true only for a /shorts/ link: other forms don't say whether
// the video is vertical, so the admin picks the format for those.
export const parseYouTubeLink = (input: string): YouTubeLink | null => {
  const value = input.trim();
  if (YOUTUBE_ID.test(value)) return { id: value, isShort: false };

  let url: URL;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  let isShort = false;

  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else {
      const match = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname);
      id = match?.[1] ?? null;
      isShort = url.pathname.startsWith("/shorts/");
    }
  }

  return id && YOUTUBE_ID.test(id) ? { id, isShort } : null;
};

export const parseYouTubeId = (input: string): string | null => parseYouTubeLink(input)?.id ?? null;
