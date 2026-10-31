import { describe, expect, it } from 'vitest';
import { parseBoard } from '../src/domain/board';
import { dash, initialState, type Direction } from '../src/domain/game';
import { solve } from '../src/domain/solver';
import { LevelSession } from '../src/application/session';

const play = (rows: string[], moves: Direction[]) => {
  const board = parseBoard(rows);
  let state = initialState(board);
  return moves.map((move) => {
    const result = dash(board, state, move);
    state = result.state;
    return result.outcome;
  });
};

describe('dash rules', () => {
  it('slides until blocked', () => {
    const board = parseBoard(['S..#F']);
    const result = dash(board, initialState(board), 'right');
    expect(result.state.at).toBe(2);
    expect(dash(board, result.state, 'right').outcome).toBe('blocked');
  });

  it('passes a closed flag and stops on an open one', () => {
    expect(play(['SF.o'], ['right', 'left'])).toEqual(['moved', 'won']);
    const board = parseBoard(['SF.']);
    expect(dash(board, initialState(board), 'right').state.at).toBe(1);
  });

  it('only counts coins collected before reaching the flag', () => {
    const board = parseBoard(['SFo']);
    expect(dash(board, initialState(board), 'right').outcome).toBe('moved');
  });

  it('falls into gaps without changing state', () => {
    const board = parseBoard(['S.~F']);
    const result = dash(board, initialState(board), 'right');
    expect(result.outcome).toBe('fell');
    expect(result.state.at).toBe(board.start);
  });

  it('stops on grass', () => {
    const board = parseBoard(['S.g.F']);
    expect(dash(board, initialState(board), 'right').state.at).toBe(2);
  });

  it('crumbles hold once', () => {
    expect(play(['S.x.', '#..#', 'F###'], ['right', 'left'])).toEqual(['moved', 'fell']);
  });

  it('clouds warp to their twin and stop there', () => {
    const board = parseBoard(['S.c#.', '####.', 'F...c']);
    const result = dash(board, initialState(board), 'right');
    expect(result.outcome).toBe('warped');
    expect(result.state.at).toBe(14);
  });
});

describe('solver', () => {
  it('finds a shortest route', () => {
    expect(solve(parseBoard(['S..o', '#...', '#..F']))).toEqual(['right', 'down']);
  });

  it('reports impossible boards', () => {
    expect(solve(parseBoard(['S#F']))).toBeNull();
  });
});

describe('LevelSession', () => {
  it('rewinds falls, supports undo and detects soft-locks', () => {
    const session = new LevelSession(parseBoard(['S.~F']));
    session.dash('right');
    expect(session.falls).toBe(1);
    expect(session.moves).toBe(0);
    expect(session.isStuck).toBe(true);
  });

  it('hint marks the attempt', () => {
    const session = new LevelSession(parseBoard(['S.F']));
    expect(session.hint()).toBe('right');
    expect(session.attempt.hinted).toBe(true);
  });
});
