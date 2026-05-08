// src/hooks/useMembers.js
import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { getMembersCollection } from "../core/clubFirestorePaths";

/**
 * Live subscription to club-scoped Firestore members collection.
 */
export function useMembers() {
  const [members, setMembers] = useState([]);

  useEffect(() => {
    const colRef = getMembersCollection(db);
    const q = query(colRef, orderBy("fullName"));

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = [];

      snap.forEach((doc) => {
        const data = doc.data() || {};
        list.push({
          id: doc.id,
          ...data,
        });
      });

      setMembers(list);
    });

    return () => unsubscribe();
  }, []);

  return members;
}