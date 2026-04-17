export interface Student {
  id: string;
  name: string;
  class: string;
  number: string;
  emoji: string;
  hp: number;
  lastActive: string;
  role: 'student' | 'admin';
}

export interface Lesson {
  topic: string;
  mode: 'individual' | 'team';
  gameType: 'post-it' | 'pet-battle';
  status: 'ready' | 'started' | 'finished';
  startedAt?: string;
}

export interface Argument {
  id: string;
  studentId: string;
  studentName: string;
  side: 'pro' | 'con';
  claim: string;
  reason: string;
  evidence: string;
  score: number;
  feedback: string;
  createdAt: string;
  battleId?: string;
  rebuttals?: Rebuttal[];
}

export interface Rebuttal {
  id: string;
  studentId: string;
  studentName: string;
  content: string; // The rebuttal or question
  score: number; // AI score of the rebuttal
  feedback: string;
  createdAt: string;
}

export interface Battle {
  id: string;
  type: string;
  teamA: string[]; // List of student IDs
  teamB: string[]; // List of student IDs
  teamASide?: 'pro' | 'con';
  teamBSide?: 'pro' | 'con';
  hpA: number;
  hpB: number;
  status: 'ongoing' | 'finished';
  winner?: string;
  currentTurn?: string; // UID of the student whose turn it is
}
