
-- Benchmark questions table
CREATE TABLE public.benchmark_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  question text NOT NULL,
  expected_answer text,
  difficulty integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Benchmark runs table
CREATE TABLE public.benchmark_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  total_score numeric NOT NULL DEFAULT 0,
  max_score numeric NOT NULL DEFAULT 0,
  category_scores jsonb NOT NULL DEFAULT '{}',
  model_config jsonb NOT NULL DEFAULT '{}',
  system_prompt_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Memory episodes table
CREATE TABLE public.memory_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  episode_type text NOT NULL DEFAULT 'interaction',
  content text NOT NULL,
  embedding_key text,
  relevance_score numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Goals table
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_type text NOT NULL DEFAULT 'system',
  description text NOT NULL,
  priority integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'active',
  progress numeric DEFAULT 0,
  parent_goal_id uuid REFERENCES public.goals(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Improvement logs table  
CREATE TABLE public.improvement_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  improvement_type text NOT NULL,
  description text NOT NULL,
  before_score numeric,
  after_score numeric,
  delta numeric,
  accepted boolean NOT NULL DEFAULT false,
  diff_content text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.benchmark_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.improvement_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies: benchmark_questions readable by all authenticated
CREATE POLICY "Authenticated users can read benchmark questions"
  ON public.benchmark_questions FOR SELECT TO authenticated USING (true);

-- RLS policies: benchmark_runs owned by user
CREATE POLICY "Users can read own benchmark runs"
  ON public.benchmark_runs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own benchmark runs"
  ON public.benchmark_runs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- RLS policies: memory_episodes owned by user
CREATE POLICY "Users can read own memory episodes"
  ON public.memory_episodes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own memory episodes"
  ON public.memory_episodes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- RLS policies: goals owned by user
CREATE POLICY "Users can read own goals"
  ON public.goals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can manage own goals"
  ON public.goals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own goals"
  ON public.goals FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- RLS policies: improvement_logs owned by user
CREATE POLICY "Users can read own improvement logs"
  ON public.improvement_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own improvement logs"
  ON public.improvement_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Seed benchmark questions
INSERT INTO public.benchmark_questions (category, question, expected_answer, difficulty) VALUES
-- Reasoning
('reasoning', 'A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost?', '$0.05', 1),
('reasoning', 'If it takes 5 machines 5 minutes to make 5 widgets, how long would it take 100 machines to make 100 widgets?', '5 minutes', 2),
('reasoning', 'In a lake, there is a patch of lily pads. Every day, the patch doubles in size. If it takes 48 days for the patch to cover the entire lake, how long would it take for the patch to cover half of the lake?', '47 days', 2),
('reasoning', 'A farmer has 17 sheep. All but 9 die. How many sheep does the farmer have left?', '9', 1),
('reasoning', 'You have a 3-gallon jug and a 5-gallon jug. How do you measure exactly 4 gallons of water?', 'Fill 5-gallon jug, pour into 3-gallon jug until full (leaving 2 gallons in 5-gallon), empty 3-gallon, pour 2 gallons from 5-gallon into 3-gallon, fill 5-gallon again, pour into 3-gallon until full (1 gallon poured), leaving 4 gallons in the 5-gallon jug.', 3),
-- Coding
('coding', 'Write a function that checks if a string is a palindrome. Return true or false.', 'function isPalindrome(s) { const cleaned = s.toLowerCase().replace(/[^a-z0-9]/g, ""); return cleaned === cleaned.split("").reverse().join(""); }', 1),
('coding', 'Implement a function that finds the longest common subsequence of two strings.', 'Dynamic programming approach with O(mn) time complexity', 3),
('coding', 'Write a function that flattens a deeply nested array. Example: [1,[2,[3,[4]]]] → [1,2,3,4]', 'function flatten(arr) { return arr.reduce((acc, val) => Array.isArray(val) ? acc.concat(flatten(val)) : acc.concat(val), []); }', 2),
-- Planning
('planning', 'You need to organize a software project with 5 developers over 3 months. The project has frontend, backend, and database components. Create a high-level plan.', 'Should include: task decomposition, dependency mapping, milestone definition, resource allocation, risk assessment', 2),
('planning', 'Design a system to handle 10 million concurrent users for a chat application. What are the key architectural decisions?', 'Should cover: horizontal scaling, message queues, WebSocket management, database sharding, caching layers, CDN, load balancing', 3),
-- Knowledge (MMLU-lite)
('mmlu', 'What is the time complexity of binary search?', 'O(log n)', 1),
('mmlu', 'In quantum mechanics, what does the Heisenberg uncertainty principle state?', 'You cannot simultaneously know the exact position and momentum of a particle with arbitrary precision', 2),
('mmlu', 'What is the difference between TCP and UDP?', 'TCP is connection-oriented with guaranteed delivery and ordering; UDP is connectionless with no delivery guarantee but lower latency', 1),
('mmlu', 'Explain the CAP theorem in distributed systems.', 'A distributed system can only guarantee two of three: Consistency, Availability, and Partition tolerance', 2),
('mmlu', 'What is the difference between supervised and unsupervised learning?', 'Supervised learning uses labeled training data; unsupervised learning finds patterns in unlabeled data', 1);
