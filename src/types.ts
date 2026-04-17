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
  claim: string;
  reason: string;
  evidence: string;
  score: number;
  feedback: string;
  createdAt: string;
  battleId?: string;
}

export interface Battle {
  id: string;
  type: string;
  teamA: string[]; // List of student IDs
  teamB: string[]; // List of student IDs
  hpA: number;
  hpB: number;
  status: 'ongoing' | 'finished';
  winner?: string;
}
