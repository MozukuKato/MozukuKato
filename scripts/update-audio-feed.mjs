import { writeFileSync } from "node:fs";

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN,
} = process.env;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
  throw new Error(
    "Missing SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, or SPOTIFY_REFRESH_TOKEN"
  );
}

function escapeXml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncate(str = "", max = 42) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function formatMs(ms = 0) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function getAccessToken() {
  const basic = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: SPOTIFY_REFRESH_TOKEN,
    }),
  });

  if (!res.ok) {
    throw new Error(`Spotify token refresh failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return json.access_token;
}

async function getNowPlaying(accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  const currentRes = await fetch(
    "https://api.spotify.com/v1/me/player/currently-playing",
    { headers }
  );

  if (currentRes.status === 200) {
    const current = await currentRes.json();

    if (current?.item) {
      return {
        live: !!current.is_playing,
        status: current.is_playing ? "LIVE" : "PAUSED",
        track: current.item.name || "Unknown Track",
        artist: (current.item.artists || []).map((a) => a.name).join(", ") || "Unknown Artist",
        album: current.item.album?.name || "Unknown Album",
        progressMs: current.progress_ms || 0,
        durationMs: current.item.duration_ms || 1,
        songUrl: current.item.external_urls?.spotify || "https://open.spotify.com/",
      };
    }
  }

  const recentRes = await fetch(
    "https://api.spotify.com/v1/me/player/recently-played?limit=1",
    { headers }
  );

  if (recentRes.ok) {
    const recent = await recentRes.json();
    const item = recent?.items?.[0]?.track;

    if (item) {
      return {
        live: false,
        status: "RECENT",
        track: item.name || "Unknown Track",
        artist: (item.artists || []).map((a) => a.name).join(", ") || "Unknown Artist",
        album: item.album?.name || "Unknown Album",
        progressMs: item.duration_ms || 0,
        durationMs: item.duration_ms || 1,
        songUrl: item.external_urls?.spotify || "https://open.spotify.com/",
      };
    }
  }

  return {
    live: false,
    status: "OFFLINE",
    track: "No playback detected",
    artist: "Spotify idle",
    album: "Waiting for signal",
    progressMs: 0,
    durationMs: 1,
    songUrl: "https://open.spotify.com/",
  };
}

function buildSvg(data) {
  const track = escapeXml(truncate(data.track, 42));
  const artist = escapeXml(truncate(data.artist, 42));
  const album = escapeXml(truncate(data.album, 42));
  const status = escapeXml(data.status);

  const progress = Math.max(
    0,
    Math.min(100, Math.round((data.progressMs / data.durationMs) * 100))
  );

  const timeText =
    data.status === "LIVE" || data.status === "PAUSED"
      ? `${formatMs(data.progressMs)} / ${formatMs(data.durationMs)}`
      : data.status === "RECENT"
      ? "LAST PLAYED"
      : "NO ACTIVE PLAYBACK";

  const activeColor =
    data.status === "LIVE"
      ? "#29c77c"
      : data.status === "RECENT"
      ? "#42a8b6"
      : "#8a286b";

  const progressColor =
    data.status === "LIVE"
      ? "url(#spotifyAccent)"
      : data.status === "RECENT"
      ? "url(#waveAccent)"
      : "#5d6e84";

  return `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="1200"
  height="420"
  viewBox="0 0 1200 420"
  role="img"
  aria-label="Mozuku audio feed"
>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#070b12"/>
      <stop offset="50%" stop-color="#04070d"/>
      <stop offset="100%" stop-color="#020409"/>
    </linearGradient>

    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#09111c"/>
      <stop offset="100%" stop-color="#060c14"/>
    </linearGradient>

    <linearGradient id="softPanel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1420"/>
      <stop offset="100%" stop-color="#07101a"/>
    </linearGradient>

    <linearGradient id="edgeAccent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#962731"/>
      <stop offset="50%" stop-color="#267e8c"/>
      <stop offset="100%" stop-color="#8a286b"/>
    </linearGradient>

    <linearGradient id="spotifyAccent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#1a8f63"/>
      <stop offset="100%" stop-color="#29c77c"/>
    </linearGradient>

    <linearGradient id="waveAccent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#267e8c"/>
      <stop offset="100%" stop-color="#42b8b7"/>
    </linearGradient>

    <style>
      @keyframes breathe {
        0%, 100% { opacity: 0.55; }
        50% { opacity: 1; }
      }

      @keyframes tracer {
        from { stroke-dashoffset: 0; }
        to { stroke-dashoffset: -3200; }
      }

      @keyframes blink {
        0%, 45% { opacity: 1; }
        50%, 95% { opacity: 0; }
        100% { opacity: 1; }
      }

      @keyframes pulse1 {
        0%, 100% { height: 18px; y: 247px; opacity: 0.55; }
        50% { height: 42px; y: 223px; opacity: 1; }
      }

      @keyframes pulse2 {
        0%, 100% { height: 28px; y: 237px; opacity: 0.7; }
        50% { height: 58px; y: 207px; opacity: 1; }
      }

      @keyframes pulse3 {
        0%, 100% { height: 14px; y: 251px; opacity: 0.5; }
        50% { height: 34px; y: 231px; opacity: 0.95; }
      }

      .mono {
        font-family:
          ui-monospace,
          SFMono-Regular,
          Menlo,
          Monaco,
          Consolas,
          "Liberation Mono",
          "Courier New",
          monospace;
      }

      .title {
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.20em;
        fill: #dce4ee;
      }

      .sub {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.17em;
        fill: #647792;
      }

      .section {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.20em;
        fill: #42a8b6;
      }

      .label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.14em;
        fill: #71849e;
      }

      .value {
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.04em;
        fill: #e5edf7;
      }

      .valueSoft {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.05em;
        fill: #9aacc2;
      }

      .tiny {
        font-size: 8px;
        letter-spacing: 0.11em;
        fill: #576a84;
      }

      .chip {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.12em;
        fill: #dce6f4;
      }

      .breathe { animation: breathe 3s ease-in-out infinite; }
      .tracer { animation: tracer 16s linear infinite; }
      .cursor { animation: blink 1s step-end infinite; }

      .bar1 { animation: pulse1 1.8s ease-in-out infinite; }
      .bar2 { animation: pulse2 2.1s ease-in-out infinite; }
      .bar3 { animation: pulse3 1.5s ease-in-out infinite; }
    </style>
  </defs>

  <rect width="1200" height="420" fill="url(#bg)"/>

  <rect x="18" y="16" width="1164" height="388" rx="24"
        fill="#04070c" stroke="#182435" stroke-width="2"/>

  <rect x="26" y="24" width="1148" height="372" rx="18"
        fill="url(#panel)" stroke="#ffffff" stroke-opacity="0.018"/>

  <rect x="18" y="16" width="1164" height="388" rx="24"
        fill="none" stroke="url(#edgeAccent)" stroke-width="1.5"
        stroke-dasharray="120 3200" stroke-linecap="round"
        opacity="0.52" class="tracer"/>

  <g class="mono">
    <circle cx="52" cy="46" r="4" fill="#2b7f8c" class="breathe"/>
    <circle cx="68" cy="46" r="4" fill="#78275e" opacity="0.7"/>
    <circle cx="84" cy="46" r="4" fill="#922e38" opacity="0.75"/>

    <text x="104" y="51" class="title">SHADOW_SYS // AUDIO FEED</text>
    <text x="104" y="72" class="sub">LIVE LISTENING SIGNAL / MOZUKU</text>

    <text x="982" y="47" class="label">SOURCE</text>
    <text x="1038" y="47" class="valueSoft" fill="#29c77c">SPOTIFY</text>

    <circle cx="986" cy="68" r="3" fill="${activeColor}" class="breathe"/>
    <text x="998" y="71" class="label">STATUS ${status}</text>
  </g>

  <line x1="48" y1="88" x2="1152" y2="88"
        stroke="#ffffff" stroke-opacity="0.035"/>

  <rect x="58" y="112" width="270" height="250" rx="16"
        fill="url(#softPanel)" stroke="#ffffff" stroke-opacity="0.022"/>

  <rect x="78" y="132" width="230" height="182" rx="12"
        fill="#07111a" stroke="#ffffff" stroke-opacity="0.018"/>

  <rect x="92" y="146" width="202" height="154" rx="10"
        fill="#0b1620" stroke="#ffffff" stroke-opacity="0.018"/>

  <circle cx="193" cy="210" r="42" fill="#101b28"/>
  <circle cx="193" cy="210" r="10" fill="#18283a"/>

  <path
    d="M213 179V236C213 245 206 252 197 252C188 252 181 246 181 239C181 232 186 227 193 227C197 227 201 229 203 231V192L238 185V226C238 235 231 242 222 242C213 242 206 236 206 229C206 222 211 217 218 217C222 217 226 219 228 221V179Z"
    fill="#2b7f8c" opacity="0.7"
  />

  <g class="mono">
    <text x="78" y="336" class="tiny">ARTWORK:// LIVE_AUDIO_FEED</text>
    <text x="290" y="336" class="tiny" text-anchor="end">SPOTIFY_SIGNAL</text>
  </g>

  <rect x="350" y="112" width="792" height="250" rx="16"
        fill="url(#softPanel)" stroke="#ffffff" stroke-opacity="0.022"/>

  <g class="mono">
    <text x="378" y="141" class="section">NOW PLAYING</text>

    <rect x="491" y="126" width="108" height="22" rx="11"
          fill="#07161a" stroke="${activeColor}" stroke-opacity="0.45"/>
    <text x="545" y="140" text-anchor="middle" class="chip">${status}</text>

    <text x="378" y="178" class="label">TRACK</text>
    <text x="378" y="205" class="value">${track}</text>

    <text x="378" y="235" class="label">ARTIST</text>
    <text x="378" y="262" class="valueSoft">${artist}</text>

    <text x="378" y="292" class="label">ALBUM</text>
    <text x="378" y="319" class="valueSoft">${album}</text>
  </g>

  <rect x="830" y="132" width="286" height="92" rx="12"
        fill="#07111a" stroke="#ffffff" stroke-opacity="0.018"/>

  <g class="mono">
    <text x="852" y="158" class="section">TELEMETRY</text>
    <text x="852" y="183" class="label">PLAYBACK</text>
    <text x="1094" y="183" text-anchor="end" class="valueSoft" fill="${activeColor}">${escapeXml(
      timeText
    )}</text>

    <rect x="852" y="194" width="220" height="8" rx="4" fill="#0d1722"/>
    <rect x="852" y="194" width="${Math.max(6, Math.round(
      (220 * progress) / 100
    ))}" height="8" rx="4" fill="${progressColor}" class="breathe"/>
  </g>

  <rect x="378" y="220" width="420" height="110" rx="12"
        fill="#07111a" stroke="#ffffff" stroke-opacity="0.018"/>

  <g class="mono">
    <text x="398" y="246" class="section">SIGNAL WAVE</text>
  </g>

  <g fill="url(#waveAccent)">
    <rect x="402" y="247" width="8" height="18" rx="4" class="bar1"/>
    <rect x="417" y="237" width="8" height="28" rx="4" class="bar2"/>
    <rect x="432" y="251" width="8" height="14" rx="4" class="bar3"/>
    <rect x="447" y="227" width="8" height="38" rx="4" class="bar2"/>
    <rect x="462" y="241" width="8" height="24" rx="4" class="bar1"/>
    <rect x="477" y="233" width="8" height="32" rx="4" class="bar3"/>
    <rect x="492" y="223" width="8" height="42" rx="4" class="bar2"/>
    <rect x="507" y="245" width="8" height="20" rx="4" class="bar1"/>
    <rect x="522" y="251" width="8" height="14" rx="4" class="bar3"/>
    <rect x="537" y="230" width="8" height="35" rx="4" class="bar2"/>
    <rect x="552" y="241" width="8" height="24" rx="4" class="bar1"/>
    <rect x="567" y="223" width="8" height="42" rx="4" class="bar2"/>
    <rect x="582" y="247" width="8" height="18" rx="4" class="bar1"/>
    <rect x="597" y="237" width="8" height="28" rx="4" class="bar2"/>
    <rect x="612" y="251" width="8" height="14" rx="4" class="bar3"/>
    <rect x="627" y="227" width="8" height="38" rx="4" class="bar2"/>
    <rect x="642" y="241" width="8" height="24" rx="4" class="bar1"/>
    <rect x="657" y="233" width="8" height="32" rx="4" class="bar3"/>
    <rect x="672" y="223" width="8" height="42" rx="4" class="bar2"/>
    <rect x="687" y="245" width="8" height="20" rx="4" class="bar1"/>
    <rect x="702" y="251" width="8" height="14" rx="4" class="bar3"/>
    <rect x="717" y="230" width="8" height="35" rx="4" class="bar2"/>
    <rect x="732" y="241" width="8" height="24" rx="4" class="bar1"/>
    <rect x="747" y="223" width="8" height="42" rx="4" class="bar2"/>
    <rect x="762" y="247" width="8" height="18" rx="4" class="bar1"/>
  </g>

  <rect x="58" y="374" width="1084" height="18" rx="9"
        fill="#050b12" stroke="#ffffff" stroke-opacity="0.022"/>

  <g class="mono">
    <text x="78" y="386" class="tiny">AUDIO_SIGNAL:// source=spotify / status=${status.toLowerCase()} / output=shadow_sys</text>
    <text x="1118" y="386" class="tiny cursor" fill="#2b7f8c">█</text>
  </g>
</svg>`;
}

const accessToken = await getAccessToken();
const nowPlaying = await getNowPlaying(accessToken);
const svg = buildSvg(nowPlaying);

writeFileSync("assets/audio-feed.svg", svg, "utf8");
console.log("Updated assets/audio-feed.svg");
