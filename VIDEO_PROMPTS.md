# Landing-page films — shot list and generation prompts

The landing page has five film slots. Until real clips exist, each slot shows a hand-built animated
scene (sunrise skyline, phone question, documents flowing into light, verified answer, golden-hour
terrace). Drop in real footage and the site switches automatically.

## Which tool

The site can't generate photoreal video of people by itself. Use a text-to-video model:

| Tool | Why | Notes |
| --- | --- | --- |
| **Google Veo 3** (Gemini / Flow / Vertex AI) | Best photoreal people and light; 8-second 1080p clips | Generate several takes per shot and pick the best. |
| **OpenAI Sora 2** | Strong cinematic camera moves, consistent characters | Good for the persona shots. |
| **Runway Gen-4 / Kling** | Image-to-video from a still you like; good for consistency | Make one hero still, then animate it. |
| **Open models (Wan 2.x, HunyuanVideo, LTX-Video)** | Run on your own GPU, no data leaves | Use **ComfyUI** or **diffusers**. **vLLM serves text models, not video**, so it is the wrong tool here. Needs a 24–80 GB GPU. |

Licensing: check the tool's commercial-use terms for your plan, keep the generation receipts, and
label the films as AI-generated if a page or campaign requires it.

## Style bible (put this into every prompt)

> Cinematic, airy, high-key photography. Soft morning or golden-hour light, cream, pale gold and white
> palette with touches of emerald and pale blue. Shallow depth of field, gentle slow camera move
> (dolly or slider), 24 fps, 16:9, photoreal, luxury-brand film look, calm and optimistic.
> Modern UAE setting: contemporary architecture, palms, sea light. People are well-dressed
> professionals, modest attire, culturally respectful. No logos, no readable brand names, no
> recognisable landmarks, no text overlays, no alcohol, no flags.

Avoid identifiable real people, real company logos and named landmarks (e.g. a specific famous tower),
because trademark and likeness rights apply to commercial use.

## Shot list (5 × 6–8 s)

### 1 · `dawn` — hero (plays behind the headline, loops)
> Wide establishing shot of a modern Gulf coastal city at sunrise, soft haze over the water, a
> traditional wooden dhow gliding slowly in the foreground, golden sun rising behind slender towers,
> seabirds crossing the frame, slow push-in. [style bible]

### 2 · `ask` — "She asks, in her own words."
> Close medium shot of a confident Emirati businesswoman in her 30s in an elegant cream abaya, seated
> at a bright café terrace in the morning, typing a question on her smartphone, a small cup of Arabic
> coffee beside a notebook, warm smile of focus, slow slider move left to right, phone screen not
> readable. [style bible]

### 3 · `checks` — "Noor reads every rule that applies."
> Abstract macro shot: translucent sheets of paper with faint text float and drift toward a soft
> glowing eight-pointed star of light in the centre, gentle particles of gold light, dreamy shallow
> focus, slow rotation, white and cream background, no readable text. [style bible]

### 4 · `answer` — "A clear answer — with its proof."
> Over-the-shoulder shot of the same woman reading a clean, light-themed answer on her phone, she
> relaxes and smiles with relief, morning sun flare, background softly blurred café and palms, slow
> push-in, screen content not readable. [style bible]

### 5 · `life` — "Back to what matters."
> Golden-hour terrace overlooking the sea, the woman walks toward family members (a husband and a young
> daughter) at a table with Arabic coffee and dates, warm embrace, palm leaves sway in the breeze,
> slow crane-up, joyful and calm. [style bible]

Optional persona clips for the "same morning" cards: a branch officer at a bright bank counter in Abu
Dhabi; a CFO walking a glass-walled office corridor in Sharjah; a compliance head reviewing a tablet in a
financial-district atrium. Use the same style bible.

## Export settings

- 1920 × 1080 (or 2560 × 1440 for the hero), 6–8 s, **no audio**, seamless loop if possible.
- Encode two versions plus a poster frame (keeps each clip around 2–4 MB):

```bash
ffmpeg -i dawn_master.mov -an -vf "scale=1920:-2,fps=24" -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 public/videos/dawn.webm
ffmpeg -i dawn_master.mov -an -vf "scale=1920:-2,fps=24" -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p -movflags +faststart public/videos/dawn.mp4
ffmpeg -i dawn_master.mov -vf "select=eq(n\,24),scale=1920:-2" -frames:v 1 public/videos/dawn.jpg
```

## Switch the site to real footage

1. Put the files in `public/videos/` (`dawn.webm`, `dawn.mp4`, `dawn.jpg`, and so on for `ask`, `checks`, `answer`, `life`).
2. In `src/config.ts`, set the paths, e.g. `dawn: "videos/dawn"`. Leave any slot empty to keep its animated scene.
3. Commit and push. Films play muted, only while on screen, and fall back to the animation if a file fails to load.
