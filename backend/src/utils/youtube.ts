const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

// Accepts a bare 11-char id or any common YouTube URL form:
// watch?v=, youtu.be/, /embed/, /shorts/, /live/, m.youtube.com, youtube-nocookie.com.
export const parseYouTubeId = (input: string): string | null => {
  const value = input.trim();
  if (YOUTUBE_ID.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;

  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else {
      const match = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname);
      id = match?.[1] ?? null;
    }
  }

  return id && YOUTUBE_ID.test(id) ? id : null;
};
