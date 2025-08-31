import React, { useState } from 'react';
import { Card, Row, Col, Input, Button, Statistic, Space, message, Typography } from 'antd';
import { CalculatorOutlined } from '@ant-design/icons';
import axios from 'axios';
import { API_BASE_URL } from '../App';

const { Title, Paragraph } = Typography;

interface ValuationResult {
  eps: number;
  retention_ratio: number;
  dividend_ratio: number;
  dividend_per_share: number;
  theoretical_price_lower: number;
  theoretical_price_upper: number;
  pe_ratio_lower: number;
  pe_ratio_upper: number;
  theoretical_price_mid: number;
  pe_ratio_mid: number;
  theoretical_price_exact?: number; // New field for exact calculation
  pe_ratio_exact?: number; // New field for exact calculation
}

const ValuationCalculator: React.FC = () => {
  const [bookValuePerShare, setBookValuePerShare] = useState<string>('');
  const [roe, setRoe] = useState<string>('');
  const [perpetualGrowthRate, setPerpetualGrowthRate] = useState<string>('3'); // Changed from 0.03 to 3
  const [requiredReturnRate, setRequiredReturnRate] = useState<string>('10'); // Changed from 0.10 to 10
  const [valuationResult, setValuationResult] = useState<ValuationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCalculateValuation = async () => {
    const bvps = parseFloat(bookValuePerShare);
    const r = parseFloat(roe);
    const pgr = parseFloat(perpetualGrowthRate);
    const rrr = parseFloat(requiredReturnRate);

    if (isNaN(bvps) || isNaN(r) || isNaN(pgr) || isNaN(rrr)) {
      message.error('请输入所有必填参数并确保为有效数字！');
      return;
    }

    const convertToDecimal = (value: number | undefined) => {
      if (value == null) return undefined;
      if (value > 0 && value <= 100) {
        return value / 100;
      }
      return value;
    };

    const adjustedRoe = convertToDecimal(r);
    const adjustedPerpetualGrowthRate = convertToDecimal(pgr);
    const adjustedRequiredReturnRate = convertToDecimal(rrr);

    setLoading(true);
    try {
      const response = await axios.post<ValuationResult>(`${API_BASE_URL}/valuation/calculate`, {
        book_value_per_share: bvps,
        roe: adjustedRoe,
        perpetual_growth_rate: adjustedPerpetualGrowthRate,
        required_return_rate: adjustedRequiredReturnRate,
      });
      setValuationResult(response.data);
      message.success('估值计算成功！');
    } catch (error) {
      console.error('估值计算失败:', error);
      message.error('估值计算失败，请检查输入或后端服务。');
      setValuationResult(null); // Clear previous results on error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <Title level={2} style={{ color: 'white', marginBottom: '20px' }}>估值计算器</Title>
      <Card title="输入参数" className="card" style={{ marginBottom: '24px' }}>
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <p>每股净资产 (Book Value Per Share):</p>
            <Input
              type="number"
              value={bookValuePerShare}
              onChange={(e) => setBookValuePerShare(e.target.value)}
              placeholder="例如: 10.5 (单位: 元)"
              step="any"
            />
          </Col>
          <Col span={12}>
            <p>净资产收益率 (ROE): <span style={{ fontSize: '0.8em', color: '#888' }}>(请输入百分数，例如 15 代表 15%)</span></p>
            <Input
              type="number"
              value={roe}
              onChange={(e) => setRoe(e.target.value)}
              placeholder="例如: 15"
              step="any"
            />
          </Col>
          <Col span={12}>
            <p>永续增长率 (Perpetual Growth Rate): <span style={{ fontSize: '0.8em', color: '#888' }}>(请输入百分数，例如 3 代表 3%)</span></p>
            <Input
              type="number"
              value={perpetualGrowthRate}
              onChange={(e) => setPerpetualGrowthRate(e.target.value)}
              placeholder="例如: 3"
              step="any"
            />
          </Col>
          <Col span={12}>
            <p>要求回报率 (Required Return Rate): <span style={{ fontSize: '0.8em', color: '#888' }}>(请输入百分数，例如 10 代表 10%)</span></p>
            <Input
              type="number"
              value={requiredReturnRate}
              onChange={(e) => setRequiredReturnRate(e.target.value)}
              placeholder="例如: 10"
              step="any"
            />
          </Col>
        </Row>
        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <Button
            type="primary"
            icon={<CalculatorOutlined />}
            onClick={handleCalculateValuation}
            loading={loading}
          >
            计算估值
          </Button>
        </div>
      </Card>

      {valuationResult && (
        <Card title="估值结果" className="card">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Statistic title="每股收益 (EPS)" value={valuationResult.eps.toFixed(4)} />
            </Col>
            <Col span={12}>
              <Statistic title="分红比率 (Dividend Ratio)" value={(valuationResult.dividend_ratio * 100).toFixed(2) + '%'} />
            </Col>
            <Col span={12}>
              <Statistic title="每股分红 (Dividend Per Share)" value={valuationResult.dividend_per_share.toFixed(4)} />
            </Col>
          </Row>

          <Row gutter={16} style={{ marginTop: 20 }}>
            {valuationResult.pe_ratio_exact != null && (
              <Col span={12}>
                <Statistic title="预估合理PE" value={valuationResult.pe_ratio_exact.toFixed(2)} />
              </Col>
            )}
            {valuationResult.theoretical_price_exact != null && (
              <Col span={12}>
                <Statistic title="预估理论股价" value={valuationResult.theoretical_price_exact.toFixed(2)} />
              </Col>
            )}
          </Row>

          <Row gutter={16} style={{ marginTop: 20 }}>
            <Col span={12}>
              <Statistic title="合理PE区间" value={`${valuationResult.pe_ratio_lower.toFixed(2)} - ${valuationResult.pe_ratio_upper.toFixed(2)}`} />
            </Col>
            <Col span={12}>
              <Statistic title="理论股价区间" value={`${valuationResult.theoretical_price_lower.toFixed(2)} - ${valuationResult.theoretical_price_upper.toFixed(2)}`} />
            </Col>
          </Row>

          <Row gutter={16} style={{ marginTop: 20 }}>
            <Col span={12}>
              <Statistic title="合理PE中值" value={valuationResult.pe_ratio_mid.toFixed(2)} />
            </Col>
            <Col span={12}>
              <Statistic title="理论股价中值" value={valuationResult.theoretical_price_mid.toFixed(2)} />
            </Col>
          </Row>

          <Paragraph type="secondary" style={{ marginTop: '20px' }}>
            * 以上估值结果基于戈登增长模型。
          </Paragraph>
        </Card>
      )}
    </div>
  );
};

export default ValuationCalculator;
