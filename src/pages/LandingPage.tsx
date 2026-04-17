import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, getDocs, where, setDoc } from 'firebase/firestore';
import { signInAnonymously, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { ShieldCheck } from 'lucide-react';
import { Student } from '../types';

export default function LandingPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  
  // Student Login State
  const [selectedClass, setSelectedClass] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [studentName, setStudentName] = useState('');
  const [isStudentLoggingIn, setIsStudentLoggingIn] = useState(false);
  const [lesson, setLesson] = useState<any>(null);

  // Admin Login State
  const [adminPassword, setAdminPassword] = useState('');
  const [storedAdminPassword, setStoredAdminPassword] = useState(import.meta.env.VITE_INITIAL_ADMIN_PASSWORD || '0000');
  const [isLoggingInAdmin, setIsLoggingInAdmin] = useState(false);

  useEffect(() => {
    // Fetch students to populate class dropdown
    const q = query(collection(db, 'students'), orderBy('class'), orderBy('number'));
    const unsubStudents = onSnapshot(q, (snapshot) => {
      const studentData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Student));
      setStudents(studentData);
    });

    // Fetch lesson info
    const unsubLesson = onSnapshot(doc(db, 'lessons', 'current'), (snap) => {
      if (snap.exists()) {
        setLesson(snap.data());
      }
    });

    // Fetch admin password
    const unsubConfig = onSnapshot(doc(db, 'config', 'admin'), (snap) => {
      if (snap.exists()) {
        setStoredAdminPassword(snap.data().adminPassword || import.meta.env.VITE_INITIAL_ADMIN_PASSWORD || '0000');
      }
    });

    return () => {
      unsubStudents();
      unsubConfig();
    };
  }, []);

  useEffect(() => {
    let uniqueClasses = Array.from(new Set(students.map(s => s.class))).sort();
    
    if (lesson?.targetClass) {
      // If a specific class is targeted for the lesson, only show that one
      if (uniqueClasses.includes(lesson.targetClass)) {
        uniqueClasses = [lesson.targetClass];
        setSelectedClass(lesson.targetClass);
      }
    }
    
    setClasses(uniqueClasses);
  }, [students, lesson]);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass || !studentNumber || !studentName) {
      alert('모든 정보를 입력해 주세요.');
      return;
    }

    setIsStudentLoggingIn(true);
    try {
      // Find student by class, number, and name
      const student = students.find(s => 
        s.class === selectedClass && 
        s.number === studentNumber && 
        s.name.trim() === studentName.trim()
      );

      if (!student) {
        alert('해당하는 학생 정보를 찾을 수 없습니다. 다시 확인해 주세요.');
        return;
      }

      const cred = await signInAnonymously(auth);
      await updateDoc(doc(db, 'students', student.id), {
        uid: cred.user.uid,
        lastActive: new Date().toISOString()
      });
      
      localStorage.setItem('argu_student_id', student.id);
      navigate('/student');
    } catch (error: any) {
      console.error(error);
      let errorMsg = '로그인 실패: ';
      if (error.code === 'auth/admin-restricted-operation') {
        errorMsg += 'Firebase 콘솔에서 [익명 로그인(Anonymous Authentication)] 기능이 활성화되어 있지 않습니다. 관리자에게 문의하여 [Build > Authentication > Sign-in method]에서 익명 로그인을 사용 설정해 주세요.';
      } else {
        errorMsg += (error.message || '알 수 없는 오류');
      }
      alert(errorMsg);
    } finally {
      setIsStudentLoggingIn(false);
    }
  };

  const handleAdminLogin = async () => {
    if (isLoggingInAdmin) return;
    
    if (adminPassword !== storedAdminPassword) {
      alert('비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsLoggingInAdmin(true);
    try {
      // 1. Sign in anonymously if not already
      let currentUser = auth.currentUser;
      if (!currentUser) {
        const cred = await signInAnonymously(auth);
        currentUser = cred.user;
      }

      // 2. Register UID as current admin in Firestore (Security Rules will verify via password_proof)
      await setDoc(doc(db, 'config', 'admin'), { 
        activeAdminUid: currentUser.uid, 
        password_proof: adminPassword 
      }, { merge: true });

      // 3. Clear password proof immediately (Security Rules don't need it persisted permanently)
      // Actually, we can leave it or clear it. Let's just navigate.
      
      console.log('Admin authenticated via password successfully.');
      navigate('/admin');
    } catch (error) {
      console.error(error);
      alert('관리자 인증 중 오류가 발생했습니다. (사유: ' + (error instanceof Error ? error.message : '알 수 없음') + ')');
    } finally {
      setIsLoggingInAdmin(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#f7f7f2]">
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-lg bg-white rounded-[3rem] shadow-[0_20px_60px_-15px_rgba(85,88,67,0.1)] p-12 relative border border-white"
      >
        <header className="text-center mb-12">
          <h1 className="text-5xl font-serif italic text-[#555843] mb-4 tracking-tight">
            Argument<br />Battlefield
          </h1>
          <p className="text-[#a1a396] font-medium tracking-wider">논증의 전장에 오신 것을 환영합니다</p>
        </header>

        {/* Student Section */}
        <section className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#b8baae] mb-2 ml-1">반 선택</label>
              <select 
                className="w-full px-6 py-4 bg-gray-50/50 rounded-2xl border-2 border-transparent focus:border-[#dcded1] outline-none font-bold text-gray-700 appearance-none cursor-pointer transition-all"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
              >
                <option value="">반을 선택하세요</option>
                {classes.map(c => (
                  <option key={c} value={c}>{c}반</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#b8baae] mb-2 ml-1">번호</label>
                <input 
                  type="text" 
                  placeholder="번호"
                  className="w-full px-6 py-4 bg-gray-50/50 rounded-2xl border-2 border-transparent focus:border-[#dcded1] outline-none font-bold text-gray-700 transition-all text-center"
                  value={studentNumber}
                  onChange={(e) => setStudentNumber(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#b8baae] mb-2 ml-1">이름</label>
                <input 
                  type="text" 
                  placeholder="이름"
                  className="w-full px-6 py-4 bg-gray-50/50 rounded-2xl border-2 border-transparent focus:border-[#dcded1] outline-none font-bold text-gray-700 transition-all text-center"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>
            </div>

            <button 
              onClick={handleStudentLogin}
              disabled={isStudentLoggingIn}
              className="w-full py-5 bg-[#555843] text-white rounded-2xl font-black text-xl shadow-lg shadow-[#555843]/20 hover:opacity-95 transition-all disabled:opacity-50 mt-2"
            >
              {isStudentLoggingIn ? '입장 중...' : '학생 입장'}
            </button>
          </div>
        </section>

        {/* Divider */}
        <div className="my-12 relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-100"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-4 bg-white text-[#b8baae] font-bold">교사 전용</span>
          </div>
        </div>

        {/* Teacher Section */}
        <section className="space-y-4">
          <input 
            type="password" 
            placeholder="교사 암호 입력"
            className="w-full px-6 py-4 bg-gray-50/50 rounded-2xl border-2 border-transparent focus:border-[#dcded1] outline-none font-bold text-gray-700 transition-all text-center"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
          />
          <button 
            onClick={handleAdminLogin}
            disabled={isLoggingInAdmin}
            className="w-full py-4 border-2 border-[#555843]/20 text-[#555843] rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            <ShieldCheck size={20} />
            {isLoggingInAdmin ? '관리자 인증 중...' : '관리자 로그인'}
          </button>
        </section>
      </motion.div>
    </div>
  );
}
