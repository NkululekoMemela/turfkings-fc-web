// src/hooks/useMembers.js
import { useEffect, useState } from "react";
import { db } from "../firebaseConfig";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

/**
 * Live subscription to Firestore "members" collection.
 * Each document is expected to have:
 *   fullName, shortName, email, role, status, createdAt ...
 */
export function useMembers() {
  const [members, setMembers] = useState([]);

  useEffect(() => {
    const colRef = collection(db, "members");
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
