import React, { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { Student, Lesson } from './types';
import LandingPage from './pages/LandingPage';
import AdminDashboard from './pages/AdminDashboard';
import StudentWorkspace from './pages/StudentWorkspace';
import BattleArena from './pages/BattleArena';

interface AuthContextType {
  user: User | null;
  studentProfile: Student | null;
  lesson: Lesson | null;
  loading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  studentProfile: null,
  lesson: null,
  loading: true,
  isAdmin: false,
});

export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [studentProfile, setStudentProfile] = useState<Student | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('AuthProvider: Initializing...');
    
    // Safety timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      console.log('AuthProvider: Loading timeout reached, forcing start.');
      setLoading(false);
    }, 5000);

    // Listen to current lesson - non-blocking for auth
    const unsubLesson = onSnapshot(doc(db, 'lessons', 'current'), (docSnap) => {
      if (docSnap.exists()) {
        setLesson(docSnap.data() as Lesson);
      }
    }, (error) => {
      console.warn('Lesson fetch failed:', error);
    });

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      console.log('Auth state changed:', u?.uid || 'No user');
      clearTimeout(timeout);
      setUser(u);
      
      if (u) {
        try {
          const q = query(collection(db, 'students'), where('uid', '==', u.uid));
          const unsubStudent = onSnapshot(q, (snap) => {
            if (!snap.empty) {
              setStudentProfile({ id: snap.docs[0].id, ...snap.docs[0].data() } as Student);
            } else {
              setStudentProfile(null);
            }
            setLoading(false);
          }, (error) => {
            console.warn('Student profile fetch failed:', error);
            setLoading(false);
          });
        } catch (err) {
          console.error('Error in auth state listener:', err);
          setLoading(false);
        }
      } else {
        setStudentProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      unsubLesson();
      clearTimeout(timeout);
    };
  }, []);

  const isAdmin = user?.email === 'jiyuu2050@gmail.com';

  return (
    <AuthContext.Provider value={{ user, studentProfile, lesson, loading, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-pink-50 text-gray-800 font-sans">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Navigate to="/" />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/student" element={<StudentWorkspace />} />
            <Route path="/battle" element={<BattleArena />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}
