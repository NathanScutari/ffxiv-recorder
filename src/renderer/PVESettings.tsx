import { configSchema, ConfigurationSchema } from 'config/configSchema';
import React from 'react';
import { Info } from 'lucide-react';
import { getLocalePhrase, Phrase } from 'localisation/translations';
import { AppState } from 'main/types';
import { setConfigValues, useSettings } from './useSettings';
import Switch from './components/Switch/Switch';
import Label from './components/Label/Label';
import { Tooltip } from './components/Tooltip/Tooltip';
import { Input } from './components/Input/Input';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from './components/Select/Select';

const raidDifficultyOptions = [
  { name: 'LFR', phrase: Phrase.LFR },
  { name: 'Normal', phrase: Phrase.Normal },
  { name: 'Heroic', phrase: Phrase.Heroic },
  { name: 'Mythic', phrase: Phrase.Mythic },
];

interface IProps {
  appState: AppState;
}

const ipc = window.electron.ipcRenderer;

const PVESettings = (props: IProps) => {
  const { appState } = props;
  const [config, setConfig] = useSettings();
  const initialRender = React.useRef(true);

  React.useEffect(() => {
    // Don't fire on the initial render.
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }

    setConfigValues({
      recordRaids: config.recordRaids,
      minEncounterDuration: config.minEncounterDuration,
      playerName: config.playerName,
      minRaidDifficulty: config.minRaidDifficulty,
      recordDungeons: config.recordDungeons,
      minKeystoneLevel: config.minKeystoneLevel,
      raidOverrun: config.raidOverrun,
      dungeonOverrun: config.dungeonOverrun,
    });
  }, [
    config.dungeonOverrun,
    config.minEncounterDuration,
    config.minKeystoneLevel,
    config.minRaidDifficulty,
    config.playerName,
    config.raidOverrun,
    config.recordDungeons,
    config.recordRaids,
  ]);

  const getSwitch = (
    preference: keyof ConfigurationSchema,
    changeFn: (checked: boolean) => void,
  ) => (
    <Switch
      checked={Boolean(config[preference])}
      name={preference}
      onCheckedChange={changeFn}
    />
  );

  const setRecordRaids = (checked: boolean) => {
    setConfig((prevState) => {
      return {
        ...prevState,
        recordRaids: checked,
      };
    });
  };

  const getRecordRaidSwitch = () => {
    return (
      <div className="flex flex-col w-[140px]">
        <Label htmlFor="recordRaids" className="flex items-center">
          {getLocalePhrase(appState.language, Phrase.RecordRaidsLabel)}
          <Tooltip
            content={getLocalePhrase(
              appState.language,
              configSchema.recordRaids.description,
            )}
            side="top"
          >
            <Info size={20} className="inline-flex ml-2" />
          </Tooltip>
        </Label>
        <div className="flex h-10 items-center">
          {getSwitch('recordRaids', setRecordRaids)}
        </div>
      </div>
    );
  };

  const setMinEncounterDuration = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const minEncounterDuration = parseInt(event.target.value, 10);

    if (Number.isNaN(minEncounterDuration)) {
      return;
    }

    setConfig((prevState) => {
      return {
        ...prevState,
        minEncounterDuration,
      };
    });
  };

  const getMinEncounterDurationField = () => {
    if (!config.recordRaids) {
      return <></>;
    }

    return (
      <div className="flex flex-col w-1/4 min-w-40 max-w-60">
        <Label htmlFor="minEncounterDuration" className="flex items-center">
          {getLocalePhrase(
            appState.language,
            Phrase.MinimumEncounterDurationLabel,
          )}
          <Tooltip
            content={getLocalePhrase(
              appState.language,
              configSchema.minEncounterDuration.description,
            )}
            side="top"
          >
            <Info size={20} className="inline-flex ml-2" />
          </Tooltip>
        </Label>
        <Input
          value={config.minEncounterDuration}
          name="minEncounterDuration"
          disabled={!config.recordRaids}
          onChange={setMinEncounterDuration}
          type="numeric"
        />
      </div>
    );
  };

  const setPlayerName = (event: React.ChangeEvent<HTMLInputElement>) => {
    setConfig((prevState) => {
      let value = event.target.value;

      setConfigValues({playerName: value});
      ipc.sendMessage('settingsChange', []);

      return {
        ...prevState,
        playerName: value,
      };
    });
  };

  const getPlayerName = () => {
    if (!config.recordRaids) {
      return <></>;
    }

    return (
      <div className="flex flex-col w-1/4 min-w-40 max-w-60">
        <Label htmlFor="playerName" className="flex items-center">
          {getLocalePhrase(
            appState.language,
            Phrase.PlayerNameLabel,
          )}
          <Tooltip
            content={getLocalePhrase(
              appState.language,
              configSchema.playerName.description,
            )}
            side="top"
          >
            <Info size={20} className="inline-flex ml-2" />
          </Tooltip>
        </Label>
        <Input
          value={config.playerName}
          name="playerName"
          disabled={!config.recordRaids}
          onChange={setPlayerName}
          type="text"
        />
      </div>
    );
  };

  const setRaidOverrun = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raidOverrun = parseInt(event.target.value, 10);

    if (Number.isNaN(raidOverrun) || raidOverrun < 0 || raidOverrun > 60) {
      // Don't allow invalid config to go further.
      return;
    }

    setConfig((prevState) => {
      return {
        ...prevState,
        raidOverrun,
      };
    });
  };

  const getRaidOverrunField = () => {
    if (!config.recordRaids) {
      return <></>;
    }

    return (
      <div className="flex flex-col w-1/4 min-w-40 max-w-60">
        <Label htmlFor="raidOverrun" className="flex items-center">
          {getLocalePhrase(appState.language, Phrase.RaidOverrunLabel)}
          <Tooltip
            content={getLocalePhrase(
              appState.language,
              configSchema.raidOverrun.description,
            )}
            side="top"
          >
            <Info size={20} className="inline-flex ml-2" />
          </Tooltip>
        </Label>
        <Input
          value={config.raidOverrun}
          name="raidOverrun"
          disabled={!config.recordRaids}
          onChange={setRaidOverrun}
          type="numeric"
        />
      </div>
    );
  };

  const setDungeonOverrun = (event: React.ChangeEvent<HTMLInputElement>) => {
    const dungeonOverrun = parseInt(event.target.value, 10);

    if (
      Number.isNaN(dungeonOverrun) ||
      dungeonOverrun < 0 ||
      dungeonOverrun > 60
    ) {
      // Don't allow invalid config to go further.
      return;
    }

    setConfig((prevState) => {
      return {
        ...prevState,
        dungeonOverrun,
      };
    });
  };

  const getDungeonOverrunField = () => {
    if (!config.recordDungeons) {
      return <></>;
    }

    return (
      <div className="flex flex-col w-1/4 min-w-40 max-w-60">
        <Label htmlFor="dungeonOverrun" className="flex items-center">
          {getLocalePhrase(appState.language, Phrase.MythicPlusOverrunLabel)}
          <Tooltip
            content={getLocalePhrase(
              appState.language,
              configSchema.dungeonOverrun.description,
            )}
            side="top"
          >
            <Info size={20} className="inline-flex ml-2" />
          </Tooltip>
        </Label>
        <Input
          value={config.dungeonOverrun}
          name="dungeonOverrun"
          disabled={!config.recordDungeons}
          onChange={setDungeonOverrun}
          type="numeric"
        />
      </div>
    );
  };

  const setRecordDungeons = (checked: boolean) => {
    setConfig((prevState) => {
      return {
        ...prevState,
        recordDungeons: checked,
      };
    });
  };

  const getRecordDungeonSwitch = () => {
    return (
      <div className="flex flex-col w-[140px]">
        <Label htmlFor="recordDungeons" className="flex items-center">
          {getLocalePhrase(appState.language, Phrase.RecordMythicPlusLabel)}
          <Tooltip
            content={getLocalePhrase(
              appState.language,
              configSchema.recordDungeons.description,
            )}
            side="top"
          >
            <Info size={20} className="inline-flex ml-2" />
          </Tooltip>
        </Label>
        <div className="flex h-10 items-center">
          {getSwitch('recordDungeons', setRecordDungeons)}
        </div>
      </div>
    );
  };

  const setMinKeystoneLevel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const minKeystoneLevel = parseInt(event.target.value, 10);

    if (Number.isNaN(minKeystoneLevel)) {
      return;
    }

    setConfig((prevState) => {
      return {
        ...prevState,
        minKeystoneLevel,
      };
    });
  };

  const getMinKeystoneLevelField = () => {
    if (!config.recordDungeons) {
      return <></>;
    }

    return (
      <div className="flex flex-col w-1/4 min-w-40 max-w-60">
        <Label htmlFor="minKeystoneLevel" className="flex items-center">
          {getLocalePhrase(appState.language, Phrase.MinimumKeystoneLevelLabel)}
          <Tooltip
            content={getLocalePhrase(
              appState.language,
              configSchema.minKeystoneLevel.description,
            )}
            side="top"
          >
            <Info size={20} className="inline-flex ml-2" />
          </Tooltip>
        </Label>
        <Input
          value={config.minKeystoneLevel}
          name="minKeystoneLevel"
          disabled={!config.recordDungeons}
          onChange={setMinKeystoneLevel}
          type="numeric"
          min={2}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-row gap-x-6">
        {getRecordRaidSwitch()}
        {getMinEncounterDurationField()}
        {getRaidOverrunField()}
        {getPlayerName()}
      </div>
    </div>
  );
};

export default PVESettings;
