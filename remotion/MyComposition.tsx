import {AbsoluteFill} from 'remotion';

export const MyComposition: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: 'white',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <h1 style={{fontSize: 80, fontFamily: 'Arial'}}>El Inmortal 2</h1>
    </AbsoluteFill>
  );
};
