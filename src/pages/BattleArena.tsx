import { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { motion, AnimatePresence } from 'motion/react';
import { Swords, Trophy, Home, Send, Sparkles, CheckCircle2, ShieldAlert, MessageCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, limit, getDocs, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Battle, Student, Argument, Rebuttal } from '../types';
import { evaluateArgument, evaluateRebuttal } from '../gemini';

export default function BattleArena() {
  const { studentProfile } = useAuth();
  const navigate = useNavigate();
  const [battle, setBattle] = useState<Battle | null>(null);
  const [opponent, setOpponent] = useState<Student | null>(null);
  const [argumentsList, setArgumentsList] = useState<Argument[]>([]);
  
  // UI State
  const [showArgModal, setShowArgModal] = useState(false);
  const [activeArgForEvidence, setActiveArgForEvidence] = useState<Argument | null>(null);
  const [showRebuttalModal, setShowRebuttalModal] = useState<Argument | null>(null);
  
  // Form State
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [rebuttalContent, setRebuttalContent] = useState('');
  
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);
  const [lastResult, setLastResult] = useState<{score: number, feedback: string} | null>(null);

  useEffect(() => {
    if (!studentProfile) return;

    const q = query(collection(db, 'battles'), where('status', '==', 'ongoing'), limit(1));
    const unsub = onSnapshot(q, (snap) => {
      const bDoc = snap.docs.find(d => d.data().teamA.includes(studentProfile.id) || d.data().teamB.includes(studentProfile.id));
      if (bDoc) {
        setBattle({ id: bDoc.id, ...bDoc.data() } as Battle);
      } else {
        matchmake();
      }
    });

    return unsub;
  }, [studentProfile]);

  useEffect(() => {
    if (!battle || !studentProfile) return;
    
    // Opponent fetch
    const oppId = battle.teamA.includes(studentProfile.id) ? battle.teamB[0] : battle.teamA[0];
    if (oppId) {
       onSnapshot(doc(db, 'students', oppId), (s) => {
          if (s.exists()) setOpponent({ id: s.id, ...s.data() } as Student);
       });
    }

    // Arguments fetch
    const q = query(collection(db, 'arguments'), where('battleId', '==', battle.id), orderBy('createdAt', 'desc'));
    const unsubArgs = onSnapshot(q, (snap) => {
      setArgumentsList(snap.docs.map(d => ({ id: d.id, ...d.data() } as Argument)));
    });

    return unsubArgs;
  }, [battle, studentProfile]);

  const matchmake = async () => {
    if (!studentProfile) return;
    const q = query(collection(db, 'battles'), where('status', '==', 'waiting'), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
       const b = snap.docs[0];
       const bData = b.data();
       const teamBSide = bData.teamASide === 'pro' ? 'con' : 'pro';
       
       await updateDoc(b.ref, {
          teamB: [studentProfile.id],
          status: 'ongoing',
          hpB: 100,
          currentTurn: bData.teamA[0],
          teamBSide: teamBSide
       });
    } else {
       const teamASide = Math.random() > 0.5 ? 'pro' : 'con';
       await addDoc(collection(db, 'battles'), {
          type: 'individual',
          teamA: [studentProfile.id],
          teamB: [],
          teamASide,
          hpA: 100,
          hpB: 100,
          status: 'waiting',
          currentTurn: studentProfile.id,
          createdAt: new Date().toISOString()
       });
    }
  };

  const handlePostReason = async () => {
    if (!battle || !studentProfile || !reason) return;
    setIsEvaluating(true);
    
    // Determine my side from battle doc
    const isTeamA = battle.teamA.includes(studentProfile.id);
    const myAssignedSide = isTeamA ? battle.teamASide : battle.teamBSide;

    try {
      const argData: Partial<Argument> = {
        battleId: battle.id,
        studentId: studentProfile.id,
        studentName: studentProfile.name,
        side: myAssignedSide || 'pro',
        reason,
        claim: (myAssignedSide === 'pro' || !myAssignedSide) ? '찬성' : '반대',
        evidence: '',
        score: 0,
        feedback: '근거를 기다리고 있습니다...',
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'arguments'), argData);
      setReason('');
      setShowArgModal(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleAddEvidence = async () => {
    if (!battle || !studentProfile || !activeArgForEvidence || !evidence) return;
    setIsEvaluating(true);
    
    try {
      const result = await evaluateArgument(activeArgForEvidence.claim, activeArgForEvidence.reason, evidence);
      setLastResult(result);
      
      const isTeamA = battle.teamA.includes(studentProfile.id);
      const mySide = isTeamA ? 'hpA' : 'hpB';
      const myCurrentHp = isTeamA ? battle.hpA : battle.hpB;

      // Rule: If score < 50, damage myself
      let hpUpdate = {};
      if (result.score < 50) {
        hpUpdate = { [mySide]: Math.max(0, myCurrentHp - 10) };
      } else {
        // Heal bit? Or just no penalty. User asked to "reduce gauge if score < 50"
      }

      await updateDoc(doc(db, 'arguments', activeArgForEvidence.id), {
        evidence,
        score: result.score,
        feedback: result.feedback
      });

      if (Object.keys(hpUpdate).length > 0) {
        await updateDoc(doc(db, 'battles', battle.id), hpUpdate);
      }

      setEvidence('');
      setActiveArgForEvidence(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsEvaluating(false);
      setTimeout(() => setLastResult(null), 3000);
    }
  };

  const handleRebuttal = async () => {
    if (!battle || !studentProfile || !showRebuttalModal || !rebuttalContent) return;
    setIsEvaluating(true);

    try {
      const result = await evaluateRebuttal(showRebuttalModal.reason, rebuttalContent);
      setLastResult(result);

      const isTeamA = battle.teamA.includes(studentProfile.id);
      const mySide = isTeamA ? 'hpA' : 'hpB';
      const myCurrentHp = isTeamA ? battle.hpA : battle.hpB;

      // If rebuttal is good (score > 70), heal 15 HP
      if (result.score > 70) {
        await updateDoc(doc(db, 'battles', battle.id), {
          [mySide]: Math.min(100, myCurrentHp + 15)
        });
      }

      const newRebuttal: Rebuttal = {
        id: Math.random().toString(36).substr(2, 9),
        studentId: studentProfile.id,
        studentName: studentProfile.name,
        content: rebuttalContent,
        score: result.score,
        feedback: result.feedback,
        createdAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'arguments', showRebuttalModal.id), {
        rebuttals: [...(showRebuttalModal.rebuttals || []), newRebuttal]
      });

      setRebuttalContent('');
      setShowRebuttalModal(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsEvaluating(false);
      setTimeout(() => setLastResult(null), 3000);
    }
  };

  if (!battle) return <div className="p-20 text-center font-bold">상대를 기다리는 중...</div>;

  const isMeTeamA = battle.teamA.includes(studentProfile?.id || '');
  const myHp = isMeTeamA ? battle.hpA : battle.hpB;
  const oppHp = isMeTeamA ? battle.hpB : battle.hpA;
  const mySide = isMeTeamA ? battle.teamASide : battle.teamBSide;
  const oppSide = isMeTeamA ? battle.teamBSide : battle.teamASide;

  return (
    <div className="min-h-screen bg-[#f0f2f5] p-6 flex flex-col font-sans">
      {/* Side Assignment Alert */}
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`mb-4 p-4 rounded-2xl text-center font-black shadow-sm border-2 ${mySide === 'pro' ? 'bg-orange-500 border-orange-600 text-white' : 'bg-blue-500 border-blue-600 text-white'}`}
      >
        📢 당신은 <span className="underline underline-offset-4">{mySide === 'pro' ? '찬성' : '반대'}</span> 입장입니다. 논리적으로 상대를 설득하세요!
      </motion.div>

      {/* Header Stats */}
      <div className="flex justify-between items-stretch gap-6 mb-8 mt-2">
        <div className="flex-1 bg-white p-6 rounded-[2.5rem] shadow-sm border flex items-center gap-6">
           <div className="w-24 h-24 bg-gray-50 rounded-[2rem] flex items-center justify-center text-6xl shadow-inner border border-white">
              {studentProfile?.emoji}
           </div>
           <div className="flex-1">
              <div className="flex justify-between items-end mb-2">
                 <span className="font-black text-gray-800 text-lg">나 ({studentProfile?.name})</span>
                 <span className="text-sm font-black text-pink-500">{myHp} / 100 HP</span>
              </div>
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden border">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${myHp}%` }} 
                  className={`h-full ${myHp < 30 ? 'bg-red-500' : 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]'}`} 
                />
              </div>
           </div>
        </div>

        <div className="flex items-center justify-center px-6">
           <div className="w-16 h-16 bg-[#555843] rounded-full flex items-center justify-center text-white shadow-xl rotate-12 border-4 border-white">
              <Swords size={32} />
           </div>
        </div>

        <div className="flex-1 bg-white p-6 rounded-[2.5rem] shadow-sm border flex items-center gap-6 flex-row-reverse text-right">
           <div className="w-24 h-24 bg-gray-50 rounded-[2rem] flex items-center justify-center text-6xl shadow-inner border border-white">
              {opponent?.emoji || '❔'}
           </div>
           <div className="flex-1 text-left">
              <div className="flex justify-between items-end mb-2 flex-row-reverse">
                 <span className="font-black text-gray-800 text-lg">상대 ({opponent?.name || '???'})</span>
                 <span className="text-sm font-black text-blue-500">{oppHp} / 100 HP</span>
              </div>
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden border">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${oppHp}%` }} 
                  className={`h-full ${oppHp < 30 ? 'bg-red-500' : 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.4)]'}`} 
                />
              </div>
           </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 overflow-hidden">
        {/* Left: Arguments & Evidence (Timeline) */}
        <div className="lg:col-span-2 bg-white rounded-[3rem] shadow-sm border p-8 flex flex-col overflow-hidden">
           <div className="flex justify-between items-center mb-8 border-b pb-6">
              <h3 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                 <MessageCircle className="text-[#555843]" /> 논증 타임라인
              </h3>
              <button 
                onClick={() => setShowArgModal(true)}
                className="px-8 py-4 bg-[#555843] text-white rounded-2xl font-black shadow-lg shadow-gray-200 hover:scale-105 transition-all text-base flex items-center gap-2"
              >
                + 내 논증 추가
              </button>
           </div>
           
           <div className="space-y-10 flex-1 overflow-y-auto pr-4 custom-scrollbar">
              {argumentsList.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-4">
                   <MessageCircle size={64} opacity={0.2} />
                   <p className="font-bold">아직 제출된 논증이 없습니다. 첫 번째 주장을 시작해 보세요!</p>
                </div>
              )}
              {argumentsList.map(arg => {
                const isMine = arg.studentId === studentProfile?.id;
                return (
                  <div key={arg.id} className={`relative p-8 rounded-[2rem] border-2 transition-all ${isMine ? 'bg-orange-50/30 border-orange-100' : 'bg-blue-50/30 border-blue-100'}`}>
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-3">
                         <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm border overflow-hidden">
                            {arg.studentId === studentProfile?.id ? studentProfile.emoji : opponent?.emoji}
                         </div>
                         <div>
                            <div className="font-black text-gray-800">{arg.studentName}</div>
                            <div className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-block ${arg.side === 'pro' ? 'bg-orange-400 text-white' : 'bg-blue-400 text-white'}`}>
                              {arg.side === 'pro' ? 'CHAN-SEONG (PRO)' : 'BAN-DAE (CON)'}
                            </div>
                         </div>
                      </div>
                      {arg.score > 0 && (
                        <div className="bg-white px-4 py-2 rounded-2xl border-2 border-dashed border-gray-200 font-black text-xl text-[#555843]">
                           {arg.score}점
                        </div>
                      )}
                    </div>

                    {/* Reason Section - MAKE IT BIG */}
                    <div className="mb-6">
                       <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 block">이유 (Reason)</span>
                       <p className="text-2xl font-black text-gray-900 leading-tight">
                         "{arg.reason}"
                       </p>
                    </div>

                    {/* Evidence Section */}
                    {arg.evidence ? (
                      <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-gray-100 shadow-sm">
                         <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-2 block">근거 (Evidence)</span>
                         <p className="text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">
                            {arg.evidence}
                         </p>
                         <div className="mt-4 pt-4 border-t border-dashed flex items-center gap-2">
                            <Sparkles size={14} className="text-blue-500" />
                            <p className="text-xs font-bold text-gray-400 italic">"{arg.feedback}"</p>
                         </div>
                      </div>
                    ) : (
                      isMine ? (
                        <button 
                          onClick={() => setActiveArgForEvidence(arg)}
                          className="w-full py-4 bg-white border-2 border-dashed border-orange-200 text-orange-600 rounded-2xl font-black text-sm hover:bg-orange-100 transition-all flex items-center justify-center gap-2"
                        >
                          <Sparkles size={18} /> 근거 보강하기 (공격 포인트!)
                        </button>
                      ) : (
                        <div className="w-full py-4 bg-gray-50 border-2 border-dashed border-gray-200 text-gray-300 rounded-2xl font-black text-xs text-center">
                           근거를 기다리는 중...
                        </div>
                      )
                    )}

                    {/* Rebuttals Section */}
                    {!isMine && !arg.evidence && (
                       <button 
                         onClick={() => setShowRebuttalModal(arg)}
                         className="absolute -right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-pink-500 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all border-4 border-white"
                         title="반박하기"
                       >
                         <Swords size={20} />
                       </button>
                    )}

                    {arg.rebuttals && arg.rebuttals.length > 0 && (
                      <div className="mt-8 space-y-4">
                         <div className="flex items-center gap-2 text-xs font-black text-pink-500">
                            <MessageCircle size={14} /> 반론/질의 {arg.rebuttals.length}개
                         </div>
                         {arg.rebuttals.map(reb => (
                           <div key={reb.id} className="ml-4 bg-pink-100/30 p-4 rounded-2xl border border-pink-100">
                              <div className="flex justify-between items-center mb-1">
                                 <span className="font-black text-pink-700 text-xs">{reb.studentName}</span>
                                 <span className="bg-pink-500 text-white px-2 py-0.5 rounded-full font-black text-[8px]">{reb.score}점</span>
                              </div>
                              <p className="text-gray-700 text-xs font-medium">"{reb.content}"</p>
                           </div>
                         ))}
                      </div>
                    )}
                  </div>
                );
              })}
           </div>
        </div>

        {/* Right: Battle Arena Visual */}
        <div className="lg:col-span-1 flex flex-col gap-8 h-full overflow-hidden">
           <div className="flex-1 relative bg-white rounded-[3rem] shadow-inner border overflow-hidden flex items-center justify-center p-8 min-h-[400px]">
              {/* Arena Decor */}
              <div className="absolute inset-x-0 bottom-12 h-16 bg-gray-50 flex flex-col items-center justify-center border-y border-gray-100">
                 <div className="text-[10px] font-black text-gray-200 uppercase tracking-[1em] mb-1">Battle Arena</div>
                 <div className="w-32 h-1 bg-gray-100 rounded-full"></div>
              </div>
              
              <div className="flex items-center justify-center gap-12 relative w-full h-full">
                <motion.div 
                  animate={{ x: isMeTeamA ? -10 : 10, y: [0, -20, 0], scale: [1, 1.05, 1] }}
                  transition={{ y: { repeat: Infinity, duration: 2 }, scale: { repeat: Infinity, duration: 4 } }}
                  className="relative z-10"
                >
                  <div className={`absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-1 rounded-xl text-[10px] font-black whitespace-nowrap border-2 shadow-sm ${mySide === 'pro' ? 'bg-orange-500 text-white border-white' : 'bg-blue-500 text-white border-white'}`}>
                      {mySide === 'pro' ? '찬성' : '반대'}
                  </div>
                  <div className="text-[10rem] filter drop-shadow-2xl">{studentProfile?.emoji}</div>
                </motion.div>

                <div className="text-6xl text-gray-100 font-black italic select-none">VS</div>

                <motion.div 
                  animate={{ x: isMeTeamA ? 10 : -10, y: [0, -25, 0], scale: [1, 1.05, 1] }}
                  transition={{ y: { repeat: Infinity, duration: 2.3 }, scale: { repeat: Infinity, duration: 4.5 } }}
                  className="relative z-10"
                >
                  <div className={`absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-1 rounded-xl text-[10px] font-black whitespace-nowrap border-2 shadow-sm ${oppSide === 'pro' ? 'bg-orange-500 text-white border-white' : 'bg-blue-500 text-white border-white'}`}>
                      {oppSide === 'pro' ? '찬성' : '반대'}
                  </div>
                  <div className="text-[10rem] filter drop-shadow-2xl opacity-90">{opponent?.emoji || '❔'}</div>
                </motion.div>
              </div>

              {/* Feedback Pop-up */}
              <AnimatePresence>
                {lastResult && (
                  <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute z-50 bottom-8 left-1/2 -translate-x-1/2 w-[80%] bg-black/90 backdrop-blur-md text-white px-8 py-6 rounded-[2rem] shadow-2xl border border-white/10">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-3xl font-black text-yellow-400">
                         {lastResult.score}
                      </div>
                      <p className="flex-1 font-bold text-sm leading-relaxed">{lastResult.feedback}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
           </div>
           
           {/* Current Topic Reminder */}
           <div className="bg-[#555843] rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-12 -mt-12"></div>
              <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em] mb-4">Current Topic</p>
              <h4 className="text-lg font-black leading-tight">
                 {battle.topic || '토론 주제가 설정되지 않았습니다.'}
              </h4>
           </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showArgModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white rounded-[3rem] p-10 max-w-md w-full shadow-2xl relative">
              <button onClick={() => setShowArgModal(false)} className="absolute top-6 right-6 text-gray-300 hover:text-gray-600"><X /></button>
              <h3 className="text-2xl font-black mb-1 text-center text-gray-800">내 주장 시작하기</h3>
              <p className="text-center text-xs font-bold text-gray-400 mb-8 lowercase tracking-widest">
                당신의 입장: { (battle.teamA.includes(studentProfile?.id || '') ? battle.teamASide : battle.teamBSide) === 'pro' ? '찬성(PRO)' : '반대(CON)' } (무작위 배정)
              </p>
              
              <div className="space-y-6">
                 <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">주장 근거 (Reason)</label>
                    <textarea 
                      placeholder="한 문장으로 핵심 이유를 써주세요."
                      className="w-full h-32 p-5 bg-gray-50 rounded-[1.5rem] border-2 border-transparent focus:border-pink-200 outline-none transition-all font-bold resize-none"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                 </div>

                 <button 
                   onClick={handlePostReason}
                   disabled={!reason}
                   className="w-full py-5 bg-pink-600 text-white rounded-2xl font-black text-xl hover:bg-pink-700 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                 >
                   포스트잇 붙이기 <Send size={20} />
                 </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {activeArgForEvidence && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white rounded-[3rem] p-10 max-w-lg w-full shadow-2xl relative">
              <button onClick={() => setActiveArgForEvidence(null)} className="absolute top-6 right-6 text-gray-300 hover:text-gray-600"><X /></button>
              <h3 className="text-2xl font-black mb-2 text-gray-800 italic">"{activeArgForEvidence.reason}"</h3>
              <p className="text-sm font-bold text-gray-400 mb-8 border-l-2 border-pink-200 pl-3">이 이유를 뒷받침할 구체적인 근거를 작성해 주세요.</p>
              
              <div className="space-y-6">
                 <textarea 
                   placeholder="객관적인 사실, 통계, 뉴스 기록 등을 활용해 보세요."
                   className="w-full h-48 p-6 bg-gray-50 rounded-[2rem] border-2 border-transparent focus:border-green-200 outline-none transition-all font-bold resize-none"
                   value={evidence}
                   onChange={(e) => setEvidence(e.target.value)}
                 />

                 <button 
                   onClick={handleAddEvidence}
                   disabled={!evidence || isEvaluating}
                   className="w-full py-5 bg-green-600 text-white rounded-2xl font-black text-xl hover:bg-green-700 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                 >
                   {isEvaluating ? <><Sparkles className="animate-pulse" /> 분석 중...</> : <>근거 제출하여 공격! <Swords size={20} /></>}
                 </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showRebuttalModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-white rounded-[3rem] p-10 max-w-lg w-full shadow-2xl relative border-4 border-pink-100">
              <button onClick={() => setShowRebuttalModal(null)} className="absolute top-6 right-6 text-gray-300 hover:text-gray-600"><X /></button>
              <h3 className="text-xl font-black mb-1 text-pink-600">반박하기</h3>
              <p className="text-xs font-bold text-gray-400 mb-6">상대방의 논증에 대해 질문하거나 논리적 허점을 지적해 보세요.</p>
              
              <div className="bg-gray-50 p-4 rounded-2xl mb-6 border italic text-xs text-gray-500">
                "{showRebuttalModal.reason}"
              </div>

              <div className="space-y-6">
                 <textarea 
                   placeholder="날카로운 질문이나 논리적인 반박을 작성하세요."
                   className="w-full h-40 p-6 bg-pink-50/20 rounded-[2rem] border-2 border-transparent focus:border-pink-300 outline-none transition-all font-bold resize-none"
                   value={rebuttalContent}
                   onChange={(e) => setRebuttalContent(e.target.value)}
                 />

                 <button 
                   onClick={handleRebuttal}
                   disabled={!rebuttalContent || isEvaluating}
                   className="w-full py-5 bg-pink-500 text-white rounded-2xl font-black text-xl hover:bg-pink-600 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                 >
                   {isEvaluating ? <><Sparkles className="animate-pulse" /> 분석 중...</> : <>반박 제출 <MessageCircle size={20} /></>}
                 </button>
                 <p className="text-[10px] text-center font-bold text-gray-400 italic">좋은 반박은 체력을 회복시켜 줍니다!</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
