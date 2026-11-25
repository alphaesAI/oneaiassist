export interface SocialTemplate {
  id: string;
  title: string;
  description: string;
  promptText: string;
  category: string;
  icon: string;
  campaign?: string;
  isPersonal?: boolean;
}

export const CURATED_TEMPLATES: SocialTemplate[] = [
  // Creator Camp / Substack Notes
  {
    id: 'cc-1',
    title: "Add your take to another sprinter's Note",
    description: "For a Note from the sprint that made you think. Post it from Substack, where restacks happen.",
    promptText: "Here's an insight from @[Creator] that changed how I look at [Topic]:\n\n\"[Quote or idea]\"\n\nMy take:\n1. [Point one]\n2. [Point two]\n\nWhat do you think? Have you experienced this?",
    category: 'Start on Substack Notes',
    campaign: 'CREATOR CAMP CONSISTENCY',
    icon: '🔁',
  },
  {
    id: 'cc-2',
    title: 'Report back on your first week of Notes',
    description: 'For the end of your first week of posting consistently.',
    promptText: "7 days of sharing daily Notes. Here are 3 unexpected things I learned:\n\n1. [Surprising realization]\n2. [What resonated most]\n3. [What I'm changing next week]\n\nIf you're on the fence about starting, here's my advice: [One actionable takeaway].",
    category: 'Start on Substack Notes',
    campaign: 'CREATOR CAMP CONSISTENCY',
    icon: '📊',
  },
  {
    id: 'cc-3',
    title: 'Tease an idea you could write a whole post about',
    description: 'For an idea with more to it than one brief note.',
    promptText: "I've been thinking a lot about [Big Idea or Counterintuitive Fact].\n\nMost people assume [Common Belief], but what if the real bottleneck is actually [Alternative Perspective]?\n\nWriting a deeper deep-dive on this. What questions should I answer?",
    category: 'Start on Substack Notes',
    campaign: 'CREATOR CAMP CONSISTENCY',
    icon: '🧩',
  },
  {
    id: 'cc-4',
    title: 'Point people to something you made',
    description: 'For a post, video, podcast, or resource you recently shipped.',
    promptText: "Just published: [Title of Work]\n\nIf you've ever struggled with [Core Problem], this was made for you.\n\nInside, I break down:\n• [Key highlight A]\n• [Key highlight B]\n• [Key highlight C]\n\nLink in bio / comments below 👇",
    category: 'Start on Substack Notes',
    campaign: 'CREATOR CAMP CONSISTENCY',
    icon: '🔗',
  },

  // Behind the Scenes
  {
    id: 'bts-1',
    title: 'The unglamorous reality of building a project',
    description: 'Show what really happens before the polished launch.',
    promptText: "What people see: [Polished result]\nWhat actually happened:\n• 14 discarded drafts\n• 3 late-night rewrites\n• 1 moment where I almost scrapped the whole thing\n\nSuccess is rarely linear. Keep showing up.",
    category: 'Behind the Scenes',
    icon: '🎬',
  },
  {
    id: 'bts-2',
    title: 'My daily content creation stack',
    description: 'Break down the tools, shortcuts, and gear you use.',
    promptText: "Here are the 4 tools that run 90% of my marketing workflow:\n\n1. [Tool 1] — for [Job to be done]\n2. [Tool 2] — for [Job to be done]\n3. [Tool 3] — for [Job to be done]\n4. [Tool 4] — for [Job to be done]\n\nTotal monthly cost: \$[Amount]. Which ones do you use?",
    category: 'Behind the Scenes',
    icon: '🛠️',
  },

  // Personal Storytelling
  {
    id: 'story-1',
    title: 'The mistake that cost me 3 months of progress',
    description: 'Share a vulnerable lesson that saves your audience time.',
    promptText: "In 2024, I made a \$[Cost/Time] mistake:\n\nI thought [Old belief or approach].\n\nHere is what happened, why it failed, and the simple framework I use today instead 👇\n\n[Your 3-step lesson]",
    category: 'Personal Storytelling',
    icon: '📖',
  },
  {
    id: 'story-2',
    title: 'A conversation with a mentor that rewired my thinking',
    description: 'Pass along wisdom that fundamentally changed your perspective.',
    promptText: "Years ago, someone I deeply respect gave me advice that stuck with me:\n\n\"[Short memorable quote]\"\n\nAt the time, I didn't fully get it. Today, it guides almost every major decision I make in [Your Field].",
    category: 'Personal Storytelling',
    icon: '💭',
  },

  // Industry Insights & Lessons
  {
    id: 'insight-1',
    title: '3 industry trends everyone is overlooking',
    description: 'Position your brand as forward-looking with contrarian observations.',
    promptText: "Everyone is focusing on [Obvious Trend].\n\nMeanwhile, the real shifts are happening quietly:\n\n1. [Quiet Shift 1]\n2. [Quiet Shift 2]\n3. [Quiet Shift 3]\n\nThose who adapt now will lead in 2027.",
    category: 'Industry Insights & Lessons',
    icon: '💡',
  },
  {
    id: 'insight-2',
    title: 'Framework: How to solve [Common Challenge]',
    description: 'A crisp, actionable blueprint that people will bookmark.',
    promptText: "How to [Achieve Desired Goal] without [Common Pain Point] (A 3-step cheat sheet):\n\nStep 1: [Action]\nStep 2: [Action]\nStep 3: [Action]\n\nSave this for your next planning session 📌",
    category: 'Industry Insights & Lessons',
    icon: '📐',
  },
];
