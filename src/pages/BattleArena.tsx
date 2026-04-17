import { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { motion, AnimatePresence } from 'motion/react';
import { Swords, Trophy, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Battle, Student } from '../types';

export default function BattleArena() {
  const { studentProfile } = useAuth();
  const navigate = useNavigate();
  const [battle, setBattle] = useState<Battle | null>(null);
  const [opponent, setOpponent] = useState<Student | null>(null);
  const [isAttacking, setIsAttacking] = useState(false);

  useEffect(() => {
    if (!studentProfile) return;

    // Find an ongoing battle I'm part of
    const q = query(collection(db, 'battles'), where('status', '==', 'ongoing'), limit(1));
    const unsub = onSnapshot(q, (snap) => {
      const b = snap.docs.find(d => d.data().teamA.includes(studentProfile.id) || d.data().teamB.includes(studentProfile.id));
      if (b) {
        setBattle({ id: b.id, ...b.data() } as Battle);
      } else {
        // Try to match or wait
        matchmake();
      }
    });

    return unsub;
  }, [studentProfile]);

  useEffect(() => {
    if (!battle || !studentProfile) return;
    const oppId = battle.teamA.includes(studentProfile.id) ? battle.teamB[0] : battle.teamA[0];
    if (oppId) {
       onSnapshot(doc(db, 'students', oppId), (s) => {
          if (s.exists()) setOpponent({ id: s.id, ...s.data() } as Student);
       });
    }
  }, [battle, studentProfile]);

  const matchmake = async () => {
    if (!studentProfile) return;
    // Check for "waiting" battles
    const q = query(collection(db, 'battles'), where('status', '==', 'waiting'), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
       const b = snap.docs[0];
       await updateDoc(b.ref, {
          teamB: [studentProfile.id],
          status: 'ongoing',
          hpB: 100
       });
    } else {
       // Create a waiting battle
       await addDoc(collection(db, 'battles'), {
          type: 'individual',
          teamA: [studentProfile.id],
          teamB: [],
          hpA: 100,
          hpB: 100,
          status: 'waiting',
          createdAt: new Date().toISOString()
       });
    }
  };

  const handleAttack = async () => {
    if (!battle || !studentProfile || !opponent || isAttacking) return;
    setIsAttacking(true);
    
    // Simulate attack
    const isTeamA = battle.teamA.includes(studentProfile.id);
    const newOppHp = Math.max(0, (isTeamA ? battle.hpB : battle.hpA) - 20);
    
    try {
      await updateDoc(doc(db, 'battles', battle.id), {
         [isTeamA ? 'hpB' : 'hpA']: newOppHp,
         status: newOppHp <= 0 ? 'finished' : 'ongoing',
         winner: newOppHp <= 0 ? studentProfile.id : null
      });
    } catch (e) {
      console.error(e);
    }

    setTimeout(() => setIsAttacking(false), 1000);
  };

  if (!battle) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
         <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity }}>
            <Swords size={100} className="text-pink-400 mb-8" />
         </motion.div>
         <h2 className="text-3xl font-bold mb-4">상대방을 찾는 중...</h2>
         <p className="text-gray-500">다른 학생이 논증을 제출하면 배틀이 시작됩니다!</p>
         <button onClick={() => navigate('/student')} className="mt-8 text-pink-600 font-bold">뒤로가기</button>
      </div>
    );
  }

  const isMeTeamA = battle.teamA.includes(studentProfile?.id || '');
  const myHp = isMeTeamA ? battle.hpA : battle.hpB;
  const oppHp = isMeTeamA ? battle.hpB : battle.hpA;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 text-white p-6 flex flex-col items-center justify-between overflow-hidden">
      <div className="w-full max-w-lg flex justify-between items-center bg-black/30 backdrop-blur-md p-4 rounded-3xl border border-white/10">
         <div className="flex items-center gap-3">
             <div className="text-4xl">{studentProfile?.emoji}</div>
             <div>
                <div className="text-sm font-bold opacity-70">나 ({studentProfile?.name})</div>
                <div className="w-32 h-3 bg-gray-700 rounded-full overflow-hidden">
                   <motion.div initial={{ width: "100%" }} animate={{ width: `${myHp}%` }} className="h-full bg-green-500" />
                </div>
             </div>
         </div>
         <div className="text-2xl font-black italic text-pink-400 px-4">VS</div>
         <div className="flex items-center gap-3 text-right">
             <div className="text-right">
                <div className="text-sm font-bold opacity-70">상대 ({opponent?.name || '???'})</div>
                <div className="w-32 h-3 bg-gray-700 rounded-full overflow-hidden">
                   <motion.div initial={{ width: "100%" }} animate={{ width: `${oppHp}%` }} className="h-full bg-red-500" />
                </div>
             </div>
             <div className="text-4xl">{opponent?.emoji || '❔'}</div>
         </div>
      </div>

      <div className="relative flex-1 w-full flex items-center justify-center">
         {/* My Pet */}
         <motion.div 
           animate={isAttacking ? { x: 100, scale: 1.2 } : { x: 0 }}
           transition={{ type: "spring" }}
           className="text-[12rem] absolute left-10 md:left-20 drop-shadow-[0_20px_50px_rgba(255,255,255,0.2)]"
         >
           {studentProfile?.emoji}
         </motion.div>

         {/* Opponent Pet */}
         <motion.div 
           animate={oppHp === 0 ? { rotate: 90, opacity: 0.5, y: 100 } : { x: 0 }}
           className="text-[12rem] absolute right-10 md:right-20 drop-shadow-[0_20px_50px_rgba(255,100,255,0.2)]"
         >
           {opponent?.emoji || '❔'}
         </motion.div>

         {battle.status === 'finished' && (
           <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="z-10 bg-white text-gray-900 p-10 rounded-[3rem] shadow-2xl text-center">
              <Trophy size={80} className="mx-auto text-yellow-500 mb-4" />
              <h3 className="text-4xl font-black mb-2">{battle.winner === studentProfile?.id ? '승리!' : '패배...'}</h3>
              <p className="mb-6 font-bold text-gray-500">멋진 논증이었습니다!</p>
              <button 
                onClick={() => navigate('/student')}
                className="px-10 py-4 bg-pink-600 text-white rounded-2xl font-bold flex items-center gap-2 mx-auto"
              >
                <Home size={20} /> 돌아가기
              </button>
           </motion.div>
         )}
      </div>

      {battle.status === 'ongoing' && (
        <div className="pb-10 w-full max-w-sm">
          <button 
             onClick={handleAttack}
             disabled={isAttacking}
             className="w-full py-6 bg-white text-purple-900 rounded-[2rem] font-black text-2xl shadow-xl hover:bg-pink-50 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
             <Swords size={24} /> 공격하기!!
          </button>
          <p className="mt-4 text-center text-sm opacity-50 font-bold tracking-widest uppercase">Tap to Attack</p>
        </div>
      )}
    </div>
  );
}
