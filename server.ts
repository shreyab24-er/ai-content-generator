import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Helper function to build structured prompt for Gemini
function buildPrompt(
  prompt: string,
  contentType: string,
  tone?: string,
  targetAudience?: string,
  lengthPreference?: string
): { systemInstruction: string; userMessage: string } {
  const toneDesc = tone ? `Tone: ${tone}.` : 'Tone: Professional yet engaging.';
  const audienceDesc = targetAudience ? `Target Audience: ${targetAudience}.` : '';
  const lengthDesc = lengthPreference ? `Length preference: ${lengthPreference}.` : '';

  let systemInstruction = `You are an expert AI content creator, copywriter, and digital marketing specialist powered by Google Gemini. 
Your task is to write high-quality, compelling, well-structured, and original content based on the user's input.
Follow these guidelines carefully:
- ${toneDesc}
- ${audienceDesc}
- ${lengthDesc}
- Format the response using clean Markdown with headings, bullet points, callouts, or emojis where appropriate for the specific content type.
- Do not include meta commentary, markdown meta text, or fluff. Start directly with the generated content or title.`;

  let typeInstructions = '';

  switch (contentType) {
    case 'Blog':
      typeInstructions = `Write a well-researched, structured blog post with an engaging title (H1), introduction with a strong hook, clear section subheadings (H2/H3), actionable takeaways, and a compelling conclusion or Call-to-Action (CTA). Include SEO-friendly keywords organically.`;
      break;

    case 'Email':
      typeInstructions = `Write a compelling email including:
1. Subject Line (provide 2-3 catchy options)
2. Preview Text
3. Email Body (personalized greeting, clear message, value proposition, bold key points)
4. Call to Action (CTA)
5. Professional Sign-off`;
      break;

    case 'LinkedIn Post':
      typeInstructions = `Craft an engaging LinkedIn post formatted specifically for LinkedIn feed reading:
- Attention-grabbing first 2 lines (hook before 'see more')
- Short, punchy paragraphs with white space for readability
- Bullet points for key insights
- Strategic emojis for visual appeal
- Thought-provoking question at the end to boost comments
- 3 to 5 relevant hashtags at the bottom`;
      break;

    case 'Instagram Caption':
      typeInstructions = `Create a viral-worthy Instagram caption:
- Strong hook line
- Engaging story or value message
- Clear Call to Action (e.g. save this post, drop a comment, link in bio)
- Visually organized with clean line breaks and emojis
- 10-15 relevant, high-performing hashtags grouped at the bottom`;
      break;

    case 'Product Description':
      typeInstructions = `Write a persuasive, high-converting product description:
- Catchy Product Title & Tagline
- Emotional/benefit-driven hook highlighting the core solution
- Key Features & Benefits formatted as bullet points
- Ideal for (Target Customer personas)
- Technical specifications / details (if applicable)
- Trust-building call-to-action`;
      break;

    case 'Text Summarizer':
      typeInstructions = `Provide a clean, comprehensive summary of the input text:
- ⚡ **TL;DR Executive Summary** (2-3 concise sentences)
- 📌 **Key Takeaways & Bullet Points**
- 🎯 **Actionable Next Steps or Main Conclusion**
Preserve key facts, dates, and figures without missing vital details.`;
      break;

    default:
      typeInstructions = `Generate clear, structured content suited for the requested format.`;
      break;
  }

  systemInstruction += `\n\nSpecific Content Type Guidance (${contentType}):\n${typeInstructions}`;

  const userMessage = `Content Type requested: ${contentType}\nPrompt / Topic / Input Text:\n"""\n${prompt}\n"""`;

  return { systemInstruction, userMessage };
}

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY')
  });
});

// API Content Generation Endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, contentType, tone, targetAudience, lengthPreference } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Please enter a prompt or topic.' });
    }

    if (!contentType || typeof contentType !== 'string') {
      return res.status(400).json({ error: 'Please select a content type.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(500).json({
        error: 'Gemini API key is not configured. Please ensure GEMINI_API_KEY is configured in Settings > Secrets.'
      });
    }

    // Initialize @google/genai SDK
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const { systemInstruction, userMessage } = buildPrompt(
      prompt.trim(),
      contentType,
      tone,
      targetAudience,
      lengthPreference
    );

    // Call Gemini 3.6 Flash model
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: userMessage,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    const generatedText = response.text;

    if (!generatedText) {
      return res.status(500).json({ error: 'Gemini returned an empty response. Please try again.' });
    }

    return res.json({
      content: generatedText,
      contentType,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error generating content with Gemini:', error);
    const errorMessage = error?.message || 'Failed to generate content. Please try again.';
    return res.status(500).json({ error: errorMessage });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
