import { useState, useEffect } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from 'firebase/auth';

export const useIsProjectMember = (user: User | null) => {
  const [isProjectMember, setIsProjectMember] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!user) {
      setIsProjectMember(false);
      setLoading(false);
      return;
    }

    const checkProjectMembership = async () => {
      try {
        setLoading(true);
        
        const projectsQuery = query(
          collection(db, "projects")
        );
        
        const projectsSnapshot = await getDocs(projectsQuery);
        
        let isMember = false;
        
        for (const doc of projectsSnapshot.docs) {
          const projectData = doc.data();
          
          if (projectData.createdBy === user.uid) {
            isMember = true;
            break;
          }
          
          if (projectData.members && projectData.members[user.uid]) {
            isMember = true;
            break;
          }
        }
        
        setIsProjectMember(isMember);
      } catch (error) {
        console.error('Error checking project membership:', error);
        setIsProjectMember(false);
      } finally {
        setLoading(false);
      }
    };

    checkProjectMembership();
  }, [user]);

  return { isProjectMember, loading };
};