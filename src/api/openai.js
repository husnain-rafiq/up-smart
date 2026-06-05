const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["openai_api_key"], (result) => {
      resolve(result.openai_api_key || null);
    });
  });
}

async function getProfile() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["freelancer_profile"], (result) => {
      resolve(result.freelancer_profile || "Freelancer with various skills");
    });
  });
}

async function getProposalInstructions() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["proposal_custom_instructions"], (result) => {
      resolve(result.proposal_custom_instructions || "");
    });
  });
}

export async function analyzeJob(jobData) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("No API key set. Please set your OpenAI key in UpSmart settings.");

  const profile = await getProfile();

  const prompt = `You are an Upwork job analyzer. Analyze this job posting for a freelancer and respond ONLY with valid JSON.

Freelancer Profile: ${profile}

Job Title: ${jobData.title}
Budget: ${jobData.budget}
Client Info: ${jobData.clientInfo}
Description: ${jobData.description}
Skills Required: ${jobData.skills}

Respond with this exact JSON structure:
{
  "score": <number 1-10>,
  "scoreLabel": "<Excellent|Good|Fair|Poor>",
  "summary": "<one sentence summary>",
  "redFlags": ["<flag1>", "<flag2>"],
  "greenFlags": ["<flag1>", "<flag2>"],
  "matchReason": "<why this matches or doesn't match the profile>",
  "estimatedBudget": "<your estimate if budget seems off>"
}`;

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 600,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "OpenAI API error");
  }

  const data = await response.json();
  const text = data.choices[0].message.content.trim();

  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    throw new Error("Failed to parse AI response");
  }
}

export async function generateProposal(jobData) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("No API key set.");

  const profile = await getProfile();
  const customInstructions = await getProposalInstructions();

  const prompt = `You are an expert Upwork proposal writer. Write a compelling, personalized cover letter for this job.

Freelancer Profile: ${profile}

Job Title: ${jobData.title}
Budget: ${jobData.budget}
Description: ${jobData.description}
Skills Required: ${jobData.skills}

Rules:
- Start with a hook that shows you understand their problem (NOT "Hi, I'm a...")
- Keep it under 200 words
- Be specific, not generic
- End with a clear call to action
- Sound human, not robotic
${customInstructions ? `\nCustom Instructions (follow these closely):\n${customInstructions}\n` : ""}
Write only the proposal text, no extra commentary.`;

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 400,
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "OpenAI API error");
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

export async function estimateQuote(jobData) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("No API key set.");

  const profile = await getProfile();

  const prompt = `You are a freelance project estimator. Analyze this Upwork job and provide a quote estimate.

Freelancer Profile: ${profile}

Job Title: ${jobData.title}
Posted Budget: ${jobData.budget}
Description: ${jobData.description}

Respond ONLY with valid JSON:
{
  "recommended": "<$X - $Y or $X/hr>",
  "hours": "<estimated hours range>",
  "rationale": "<2 sentences why>",
  "negotiationTip": "<one tip for negotiating>"
}`;

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 300,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) throw new Error("OpenAI API error");

  const data = await response.json();
  const text = data.choices[0].message.content.trim();
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}
