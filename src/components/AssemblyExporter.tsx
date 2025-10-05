import React, { useState } from 'react';
import c from './styles.module.css';

const AssemblyExporter = () => {
  const [lastSelection, setLastSelection] = useState<Array<{ modelId: string; ids: number[] }>>([]);

  // Other component logic

  return (
    <div>
      {/* Other component JSX */}
      <button style={c.btnGhost}>Export</button>
    </div>
  );
};

export default AssemblyExporter;
