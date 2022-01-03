import * as React from 'react';
import { useDispatch } from 'react-redux';
import { transcribeFile } from '../state/transcribe';
import { TitleBar } from '../components/TitleBar';
import { AppContainer, MainCenterColumn } from '../components/Util';
import styled from 'styled-components';
import { openModelManager } from '../state/nav';
import { openDocumentFromDisk, openDocumentFromMemory } from '../state/editor';
import { resetTour } from '../components/Tour';
import { Button, CommentIcon, IconButton, SettingsIcon, Tooltip } from 'evergreen-ui';
import { LandingTour } from '../tour/LandingTour';

const BottomRightContainer = styled.div`
  position: absolute;
  bottom: 0;
  right: 0;
  margin: 10px;
  & > * {
    margin: 5px;
  }
`;

export function LandingPage(): JSX.Element {
  const dispatch = useDispatch();

  return (
    <AppContainer>
      <LandingTour />
      <TitleBar />
      <MainCenterColumn>
        <Button
          appearance="primary"
          onClick={() => dispatch(transcribeFile())}
          id={'import' /* for tour */}
          size={'large'}
          marginY={5}
          width={300}
        >
          Import & Transcribe
        </Button>
        <Button
          appearance="primary"
          onClick={() => dispatch(openDocumentFromDisk())}
          size={'large'}
          marginY={5}
          width={300}
        >
          Open Existing
        </Button>
        <Button
          onClick={() => dispatch(openDocumentFromMemory({ sources: {}, content: [] }))}
          size={'large'}
          marginY={20}
          width={300}
        >
          New Blank Document
        </Button>
      </MainCenterColumn>
      <BottomRightContainer>
        <Tooltip content="restart help tour">
          <IconButton icon={CommentIcon} onClick={() => resetTour()} />
        </Tooltip>
        <Tooltip content="manage transcription models">
          <IconButton icon={SettingsIcon} onClick={() => dispatch(openModelManager())} />
        </Tooltip>
      </BottomRightContainer>
    </AppContainer>
  );
}
