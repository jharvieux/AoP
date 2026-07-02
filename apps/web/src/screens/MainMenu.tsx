interface MainMenuProps {
  onStart: () => void
  onThemePacks: () => void
}

export function MainMenu({ onStart, onThemePacks }: MainMenuProps) {
  return (
    <div className="screen menu-screen">
      <div className="menu-content">
        <h1 className="game-title">Age of Plunder</h1>
        <p className="game-subtitle">A pirate strategy game</p>
        <button className="primary large" onClick={onStart}>
          New Game
        </button>
        <button className="secondary large" onClick={onThemePacks}>
          Theme Packs
        </button>
      </div>
    </div>
  )
}
