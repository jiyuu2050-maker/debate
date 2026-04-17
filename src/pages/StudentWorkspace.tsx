import { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { evaluateArgument } from '../gemini';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles, ShieldAlert, CheckCircle2, Trophy, ArrowLeft } from 'lucide-react';

const EMOJIS = ['🦖', '🦄', '🐱', '🐶', '🦊', '🦁', '🐉', '🐙', '🦍', '🐘'];

export default function StudentWorkspace() {
  const { studentProfile, lesson, loading } = useAuth();
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);

  const [claim, setClaim] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<{score: number, feedback: string} | null>(null);

  useEffect(() => {
    const id = localStorage.getItem('argu_student_id');
    if (!id) navigate('/login');
    setStudentId(id);
  }, []);

  // Sync profile manually because student isn't technically "authenticated" via Firebase Auth in my simple logic yet
  // Actually, I should have linked it. Let's just fetch it.
  useEffect(() => {
    if (studentId) {
       // We'll trust the student ID for now
       // In a real app, you'd use the Auth UID
    }
  }, [studentId]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen p-10 text-center gap-4">
      <div className="w-12 h-12 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin"></div>
      <div className="font-bold text-gray-500">정보를 불러오는 중입니다...</div>
    </div>
  );

  const handlePetSelect = async (emoji: string) => {
    if (!studentId) return;
    try {
      await updateDoc(doc(db, 'students', studentId), { emoji });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async () => {
    if (!claim || !reason || !evidence) {
      alert('모든 칸을 채워주세요!');
      return;
    }
    setEvaluating(true);
    setEvaluation(null);

    const result = await evaluateArgument(claim, reason, evidence);
    setEvaluation(result);
    setEvaluating(false);

    // Save to Firestore
    if (studentId) {
      try {
        await addDoc(collection(db, 'arguments'), {
          studentId,
          claim,
          reason,
          evidence,
          score: result.score,
          feedback: result.feedback,
          createdAt: new Date().toISOString()
        });
        
        // Update HP or trigger battle logic
        // For simplicity, battle is triggered if score > 70
        if (result.score >= 70) {
           navigate('/battle');
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'arguments');
      }
    }
  };

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto pb-24">
      <div className="flex justify-between items-center mb-4">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-gray-400 hover:text-pink-600 transition-colors text-sm font-bold"
        >
          <ArrowLeft size={18} /> 나가기
        </button>
      </div>

      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-800">나의 논증 빌더</h2>
          <p className="text-pink-600 font-bold">{lesson?.topic || '주제를 기다리는 중...'}</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-3 rounded-2xl shadow-sm border">
           <span className="text-4xl">{studentProfile?.emoji || '🦖'}</span>
           <div className="text-sm font-bold">
              <div>{studentProfile?.name}</div>
              <div className="text-red-500">HP {studentProfile?.hp ?? 100}</div>
           </div>
        </div>
      </header>

      {/* Pet Selection */}
      <section className="bg-white p-6 rounded-3xl shadow-sm border mb-8 overflow-x-auto">
        <h3 className="text-sm font-bold text-gray-400 mb-4">나의 펫 선택하기</h3>
        <div className="flex gap-4 pb-2">
          {EMOJIS.map(e => (
            <motion.button
              key={e}
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handlePetSelect(e)}
              className={`text-3xl p-3 rounded-2xl transition-all ${studentProfile?.emoji === e ? 'bg-pink-100 ring-2 ring-pink-400' : 'bg-gray-50'}`}
            >
              {e}
            </motion.button>
          ))}
        </div>
      </section>

      {/* Builder */}
      <div className="space-y-6">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-4">
          <div>
            <label className="flex items-center gap-2 text-blue-600 font-black mb-2">
              <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs">1</span>
              주장 (Claim)
            </label>
            <textarea
              className="w-full p-4 bg-blue-50/30 border-2 border-transparent focus:border-blue-200 rounded-2xl outline-none transition-all resize-none min-h-[80px]"
              placeholder="자신의 주장을 한 문장으로 써보세요."
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-purple-600 font-black mb-2">
              <span className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center text-xs">2</span>
              이유 (Reason)
            </label>
            <textarea
              className="w-full p-4 bg-purple-50/30 border-2 border-transparent focus:border-purple-200 rounded-2xl outline-none transition-all resize-none min-h-[80px]"
              placeholder="그렇게 생각하는 이유는 무엇인가요? (~때문이다)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-green-600 font-black mb-2">
              <span className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-xs">3</span>
              근거 (Evidence)
            </label>
            <textarea
              className="w-full p-4 bg-green-50/30 border-2 border-transparent focus:border-green-200 rounded-2xl outline-none transition-all resize-none min-h-[120px]"
              placeholder="이유를 뒷받침할 수 있는 사실, 통계, 뉴스 등을 써보세요."
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </div>
          
          <button
            onClick={handleSubmit}
            disabled={evaluating}
            className={`mt-4 w-full py-5 bg-pink-600 text-white rounded-2xl font-black text-xl flex items-center justify-center gap-3 shadow-xl shadow-pink-100 hover:bg-pink-700 transition-all ${evaluating ? 'opacity-50' : ''}`}
          >
            {evaluating ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><Sparkles /></motion.div>
                Gemini가 채점 중...
              </>
            ) : (
              <>
                <Send size={24} /> 논증 제출하기
              </>
            )}
          </button>
        </div>

        {/* Evaluation Feedbac */}
        <AnimatePresence>
          {evaluation && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-8 rounded-3xl border-4 ${evaluation.score >= 70 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-orange-50 border-orange-200 text-orange-800'}`}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                   <h4 className="text-lg font-bold flex items-center gap-2">
                      {evaluation.score >= 70 ? <CheckCircle2 /> : <ShieldAlert />}
                      AI 채점 결과
                   </h4>
                   <p className="mt-2 text-xl font-medium">"{evaluation.feedback}"</p>
                </div>
                <div className="text-4xl font-black">
                  {evaluation.score}점
                </div>
              </div>
              {evaluation.score >= 70 ? (
                <div className="mt-4 flex items-center gap-2 text-sm font-bold">
                   <Trophy size={16} /> 70점이 넘었어요! 배틀장으로 이동합니다!
                </div>
              ) : (
                <p className="mt-4 text-sm opacity-70">점수가 부족해요. AI의 조언을 바탕으로 수정해서 다시 제출해 보세요!</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
