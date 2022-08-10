import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
// import icon from '../../assets/icon.svg';
import React, { useState } from 'react';
import 'antd/dist/antd.css';
import './App.css';
import {
  AppstoreOutlined,
  BarChartOutlined,
  CloudOutlined,
  ShopOutlined,
  TeamOutlined,
  UploadOutlined,
  UserOutlined,
  VideoCameraOutlined,
  LockOutlined,
} from '@ant-design/icons';
import {
  Layout,
  Menu,
  Button,
  PageHeader,
  Descriptions,
  MenuProps,
  Divider,
  Row,
  Col,
  Modal,
} from 'antd';

const { Header, Content, Footer, Sider } = Layout;

const Main = () => {
  const [state, setState] = useState([]);

  const lockData = {
    lockMac: '',
    modelNum: '',
    hardwareVer: '',
    firmwareVer: '',
    settingMode: '',
    battery: '',
    rssi: '',
  };
  const [lockDataState, setLockDataState] = useState(lockData);

  window.electron.ipcRenderer.on('foundDevice', (lockData: object) => {
    setState([
      ...state,
      {
        key: state.length + 1,
        icon: React.createElement(LockOutlined),
        label: lockData.lockMac,
        data: lockData,
      },
    ]);
  });

  window.electron.ipcRenderer.on('readLockTimeRes', (res: object) => {
    console.log('res', res);
  });

  const onClick: MenuProps['onClick'] = (e) => {
    const {
      data: {
        lockMac,
        modelNum,
        hardwareVer,
        firmwareVer,
        settingMode,
        battery,
        rssi,
      },
    } = state.find(({ key }) => key == e.key);
    window.electron.ipcRenderer.sendMessage('selectDevice', lockMac);
    setLockDataState({
      lockMac,
      modelNum,
      hardwareVer,
      firmwareVer,
      settingMode,
      battery,
      rssi,
    });
  };

  return (
    <Layout hasSider>
      <Sider
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Button
            type="primary"
            className="logo"
            onClick={() => {
              setState([]);
              setLockDataState({
                lockMac: '',
                modelNum: '',
                hardwareVer: '',
                firmwareVer: '',
                settingMode: '',
                battery: '',
                rssi: '',
              });
              window.electron.ipcRenderer.sendMessage('refresh');
            }}
          >
            Refresh
          </Button>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          items={state}
          onClick={onClick}
        />
      </Sider>
      <Layout
        className="site-layout"
        style={{
          marginLeft: 200,
          height: '100hv',
        }}
      >
        <PageHeader
          ghost={false}
          onBack={() => window.history.back()}
          title={lockDataState.lockMac}
          extra={[
            // <Button key="2" type="primary">
            //   Primary
            // </Button>,
            <div style={{ height: 40 }} />,
          ]}
        >
          <Descriptions size="small" column={3}>
            <Descriptions.Item label="ModelNum">
              {lockDataState.modelNum}
            </Descriptions.Item>
            <Descriptions.Item label="hardwareVer">
              {lockDataState.hardwareVer}
            </Descriptions.Item>
            <Descriptions.Item label="firmwareVer">
              {lockDataState.firmwareVer}
            </Descriptions.Item>
            <Descriptions.Item label="battery">
              {lockDataState.battery}
            </Descriptions.Item>
            <Descriptions.Item label="rssi">
              {lockDataState.rssi}
            </Descriptions.Item>
            <Descriptions.Item label="settingMode">
              {lockDataState.settingMode?.toString()}
            </Descriptions.Item>
          </Descriptions>
        </PageHeader>
        {lockDataState.lockMac !== '' && <Operations />}
      </Layout>
    </Layout>
  );
};

const Operations = () => {
  return (
    <div style={{ backgroundColor: 'white' }}>
      <Divider orientation="center">Operations</Divider>
      <Row gutter={[16, 24]}>
        <Col span={8}>
          <CustomButton func="readLockTime">Read Lock Time</CustomButton>
        </Col>
        <Col span={8}>
          <CustomButton func="unlock">Unlock</CustomButton>
        </Col>
        <Col span={8}>
          <CustomButton func="lock">Lock</CustomButton>
        </Col>
        <Col span={8}>
          <Button type="primary" block>
            Add Period Code
          </Button>
        </Col>
      </Row>
    </div>
  );
};

const CustomButton = ({ func, children }) => {
  const [isModalVisible, setModalVisible] = useState(false);
  const [res, setRes] = useState('');
  const [isLoading, setLoading] = useState(false);
  window.electron.ipcRenderer.on(func + 'Res', (res: object) => {
    setRes(JSON.stringify(res));
    setLoading(false);
    setModalVisible(true);
  });
  return (
    <>
      <Modal
        title="Basic Modal"
        visible={isModalVisible}
        onOk={() => setModalVisible(false)}
        cancelButtonProps={{ disabled: true }}
      >
        <p>{res}</p>
      </Modal>
      <Button
        type="primary"
        block
        loading={isLoading}
        onClick={() => {
          setLoading(true);
          window.electron.ipcRenderer.sendMessage(func);
        }}
      >
        {children}
      </Button>
    </>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Main />} />
      </Routes>
    </Router>
  );
}
