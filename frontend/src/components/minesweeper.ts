import { bindable, ICustomElementViewModel } from 'aurelia';
import './minesweeper.css';
import { IHydratedController } from '@aurelia/runtime-html';

interface Cell {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  neighborMines: number;
  row: number;
  col: number;
}

export class Minesweeper implements ICustomElementViewModel {
  private board: Cell[][] = [];
  private gameOver = false;
  private gameWon = false;
  @bindable({ type: Number }) private mineCount = 40;
  @bindable({ type: Number }) private boardSize = 16;
  @bindable private cellSize: 'small' | 'medium' | 'large' = 'large';
  @bindable private compact = false;
  @bindable private showControls = true;
  private remainingFlags: number;
  private firstClick = true;

  async attaching() {
    this.remainingFlags = this.mineCount;
    this.initializeBoard();
  }

  private initializeBoard(): void {
    this.board = [];
    for (let i = 0; i < this.boardSize; i++) {
      this.board[i] = [];
      for (let j = 0; j < this.boardSize; j++) {
        this.board[i][j] = {
          isMine: false,
          isRevealed: false,
          isFlagged: false,
          neighborMines: 0,
          row: i,
          col: j
        };
      }
    }
  }

  private placeMines(firstRow: number, firstCol: number): void {
    let minesPlaced = 0;
    while (minesPlaced < this.mineCount) {
      const row = Math.floor(Math.random() * this.boardSize);
      const col = Math.floor(Math.random() * this.boardSize);
      
      // Don't place mine on first click or if there's already a mine
      if (!this.board[row][col].isMine && 
          !(row === firstRow && col === firstCol) &&
          !this.isAdjacent(row, col, firstRow, firstCol)) {
        this.board[row][col].isMine = true;
        minesPlaced++;
      }
    }
    this.calculateNeighborMines();
  }

  private isAdjacent(row1: number, col1: number, row2: number, col2: number): boolean {
    return Math.abs(row1 - row2) <= 1 && Math.abs(col1 - col2) <= 1;
  }

  private calculateNeighborMines(): void {
    for (let i = 0; i < this.boardSize; i++) {
      for (let j = 0; j < this.boardSize; j++) {
        if (!this.board[i][j].isMine) {
          this.board[i][j].neighborMines = this.countAdjacentMines(i, j);
        }
      }
    }
  }

  private countAdjacentMines(row: number, col: number): number {
    let count = 0;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const newRow = row + i;
        const newCol = col + j;
        if (newRow >= 0 && newRow < this.boardSize && 
            newCol >= 0 && newCol < this.boardSize && 
            this.board[newRow][newCol].isMine) {
          count++;
        }
      }
    }
    return count;
  }

  private revealCell(row: number, col: number): void {
    if (this.firstClick) {
      this.placeMines(row, col);
      this.firstClick = false;
    }

    const cell = this.board[row][col];
    if (cell.isRevealed || cell.isFlagged || this.gameOver) return;

    cell.isRevealed = true;

    if (cell.isMine) {
      this.gameOver = true;
      this.revealAllMines();
      return;
    }

    if (cell.neighborMines === 0) {
      this.revealAdjacentCells(row, col);
    }

    this.checkWinCondition();
  }

  private revealAdjacentCells(row: number, col: number): void {
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const newRow = row + i;
        const newCol = col + j;
        if (newRow >= 0 && newRow < this.boardSize && 
            newCol >= 0 && newCol < this.boardSize && 
            !this.board[newRow][newCol].isRevealed) {
          this.revealCell(newRow, newCol);
        }
      }
    }
  }

  private toggleFlag(row: number, col: number): void {
    const cell = this.board[row][col];
    if (!cell.isRevealed && !this.gameOver) {
      if (!cell.isFlagged && this.remainingFlags > 0) {
        cell.isFlagged = true;
        this.remainingFlags--;
      } else if (cell.isFlagged) {
        cell.isFlagged = false;
        this.remainingFlags++;
      }
    }
  }

  private revealAllMines(): void {
    for (let i = 0; i < this.boardSize; i++) {
      for (let j = 0; j < this.boardSize; j++) {
        if (this.board[i][j].isMine) {
          this.board[i][j].isRevealed = true;
        }
      }
    }
  }

  private checkWinCondition(): void {
    let unrevealedSafeCells = false;
    for (let i = 0; i < this.boardSize; i++) {
      for (let j = 0; j < this.boardSize; j++) {
        if (!this.board[i][j].isMine && !this.board[i][j].isRevealed) {
          unrevealedSafeCells = true;
          break;
        }
      }
    }
    if (!unrevealedSafeCells) {
      this.gameWon = true;
      this.gameOver = true;
    }
  }

  public handleClick(row: number, col: number, event: MouseEvent): void {
    event.preventDefault();
    if (event.button === 2 || event.ctrlKey) {
      this.toggleFlag(row, col);
    } else {
      this.revealCell(row, col);
    }
  }

  public resetGame(): void {
    this.gameOver = false;
    this.gameWon = false;
    this.firstClick = true;
    this.remainingFlags = this.mineCount;
    this.initializeBoard();
    this.board = [...this.board];
  }

  public getCellClass(cell: Cell): string {
    const sizeClass = `cell-${this.cellSize}`;
    const stateClass = !cell.isRevealed ? 'cell-hidden' : 
                      cell.isFlagged ? 'cell-flagged' : 
                      cell.isMine ? 'cell-mine' : 
                      `cell-${cell.neighborMines}`;
    return `cell ${sizeClass} ${stateClass}`;
  }

  public getContainerClass(): string {
    return `minesweeper-container ${this.compact ? 'minesweeper-compact' : ''}`;
  }
} 