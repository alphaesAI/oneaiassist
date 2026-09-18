'use client';

import React from 'react';
import { motion } from 'framer-motion';

export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.18,
        ease: [0.16, 1, 0.3, 1], // Custom snappy ease-out curve
      }}
      className="flex-1 flex flex-col min-h-0 w-full"
    >
      {children}
    </motion.div>
  );
}
